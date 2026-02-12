import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  generateOrderNumber,
  generateTicketCode,
} from "@/lib/ticket-utils";
import { sendOrderConfirmationEmail } from "@/lib/email";

/**
 * POST /api/stripe/confirm-order
 *
 * Called by the checkout after Stripe payment succeeds on the client.
 * Verifies the PaymentIntent with Stripe, then creates the order + tickets.
 *
 * This is the primary order-creation path for Stripe payments.
 * The webhook handler is a backup (both are idempotent via payment_ref check).
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.json();
    const { payment_intent_id } = body;

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: "Missing payment_intent_id" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Auto-detect connected account from site_settings
    let stripeAccountId: string | null = null;
    const { data: settingsRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", "feral_stripe_account")
      .single();

    if (settingsRow?.data && typeof settingsRow.data === "object") {
      const settingsData = settingsRow.data as { account_id?: string };
      if (settingsData.account_id) {
        stripeAccountId = settingsData.account_id;
      }
    }

    // Retrieve the PaymentIntent from Stripe to verify it actually succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment_intent_id,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment not completed. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // Check if order already exists (idempotent — webhook may have created it)
    const { data: existingOrder } = await supabase
      .from(TABLES.ORDERS)
      .select("id")
      .eq("payment_ref", payment_intent_id)
      .eq("org_id", ORG_ID)
      .single();

    if (existingOrder) {
      // Order already created — fetch and return it
      const { data: fullOrder } = await supabase
        .from(TABLES.ORDERS)
        .select(`
          *,
          order_items (*, ticket_type:ticket_types(*)),
          tickets (*),
          customer:customers(*)
        `)
        .eq("id", existingOrder.id)
        .single();

      return NextResponse.json({ data: fullOrder });
    }

    // Extract metadata from the PaymentIntent
    const metadata = paymentIntent.metadata;
    const eventId = metadata.event_id;
    const orgId = metadata.org_id || ORG_ID;
    const customerEmail = metadata.customer_email;
    const customerFirstName = metadata.customer_first_name;
    const customerLastName = metadata.customer_last_name;
    const customerPhone = metadata.customer_phone;
    const itemsJson = metadata.items_json;

    if (!eventId || !customerEmail || !itemsJson) {
      return NextResponse.json(
        { error: "PaymentIntent missing required metadata" },
        { status: 400 }
      );
    }

    const items: { ticket_type_id: string; qty: number; merch_size?: string }[] =
      JSON.parse(itemsJson);

    // Fetch event (include venue/date fields for order confirmation email)
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, currency, venue_name, date_start, doors_time")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();

    if (!event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Fetch ticket types
    const ticketTypeIds = items.map((i) => i.ticket_type_id);
    const { data: ticketTypes } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("*")
      .eq("org_id", orgId)
      .in("id", ticketTypeIds);

    if (!ticketTypes) {
      return NextResponse.json(
        { error: "Failed to fetch ticket types" },
        { status: 500 }
      );
    }

    const ttMap = new Map(ticketTypes.map((tt) => [tt.id, tt]));

    // Upsert customer
    const { data: existingCustomer } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id")
      .eq("org_id", orgId)
      .eq("email", customerEmail)
      .single();

    let customerId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
      await supabase
        .from(TABLES.CUSTOMERS)
        .update({
          first_name: customerFirstName,
          last_name: customerLastName,
          phone: customerPhone || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from(TABLES.CUSTOMERS)
        .insert({
          org_id: orgId,
          email: customerEmail,
          first_name: customerFirstName,
          last_name: customerLastName,
          phone: customerPhone || undefined,
          first_order_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (custErr || !newCustomer) {
        return NextResponse.json(
          { error: "Failed to create customer" },
          { status: 500 }
        );
      }
      customerId = newCustomer.id;
    }

    // Calculate totals
    let subtotal = 0;
    for (const item of items) {
      const tt = ttMap.get(item.ticket_type_id);
      if (tt) subtotal += Number(tt.price) * item.qty;
    }

    const total = paymentIntent.amount / 100;
    const fees = total - subtotal;

    // Create order with retry for order_number collisions
    let order = null;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const orderNumber = await generateOrderNumber(supabase, orgId);

      const { data, error } = await supabase
        .from(TABLES.ORDERS)
        .insert({
          org_id: orgId,
          order_number: orderNumber,
          event_id: eventId,
          customer_id: customerId,
          status: "completed",
          subtotal,
          fees: fees > 0 ? fees : 0,
          total,
          currency: (event.currency || "GBP").toUpperCase(),
          payment_method: "stripe",
          payment_ref: payment_intent_id,
        })
        .select()
        .single();

      if (data) {
        order = data;
        break;
      }

      const errMsg = error?.message || "";
      if (errMsg.includes("duplicate") || errMsg.includes("unique")) {
        continue;
      }
      console.error("Order creation failed:", error);
      break;
    }

    if (!order) {
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Create order items and tickets
    const allTickets: {
      org_id: string;
      order_item_id: string;
      order_id: string;
      event_id: string;
      ticket_type_id: string;
      customer_id: string;
      ticket_code: string;
      holder_first_name: string;
      holder_last_name: string;
      holder_email: string;
      merch_size?: string;
    }[] = [];

    for (const item of items) {
      const tt = ttMap.get(item.ticket_type_id);
      if (!tt) continue;

      const { data: orderItem } = await supabase
        .from(TABLES.ORDER_ITEMS)
        .insert({
          org_id: orgId,
          order_id: order.id,
          ticket_type_id: item.ticket_type_id,
          qty: item.qty,
          unit_price: tt.price,
          merch_size: item.merch_size,
        })
        .select("id")
        .single();

      if (!orderItem) continue;

      for (let i = 0; i < item.qty; i++) {
        allTickets.push({
          org_id: orgId,
          order_item_id: orderItem.id,
          order_id: order.id,
          event_id: eventId,
          ticket_type_id: item.ticket_type_id,
          customer_id: customerId,
          ticket_code: generateTicketCode(),
          holder_first_name: customerFirstName,
          holder_last_name: customerLastName,
          holder_email: customerEmail,
          merch_size: item.merch_size,
        });
      }

      // Update sold count
      await supabase
        .from(TABLES.TICKET_TYPES)
        .update({
          sold: tt.sold + item.qty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.ticket_type_id);
    }

    if (allTickets.length > 0) {
      await supabase.from(TABLES.TICKETS).insert(allTickets);
    }

    // Update customer stats
    const { data: custOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("total")
      .eq("customer_id", customerId)
      .eq("org_id", orgId)
      .eq("status", "completed");

    if (custOrders) {
      const totalSpent = custOrders.reduce(
        (sum: number, o: { total: number }) => sum + Number(o.total),
        0
      );
      await supabase
        .from(TABLES.CUSTOMERS)
        .update({
          total_orders: custOrders.length,
          total_spent: totalSpent,
          last_order_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);
    }

    // Send order confirmation email (fire-and-forget — never blocks the response)
    sendOrderConfirmationEmail({
      orgId,
      order: {
        id: order.id,
        order_number: order.order_number,
        total,
        currency: (event.currency || "GBP").toUpperCase(),
      },
      customer: {
        first_name: customerFirstName,
        last_name: customerLastName,
        email: customerEmail,
      },
      event: {
        name: event.name,
        slug: event.slug,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
        currency: event.currency,
      },
      tickets: allTickets.map((t) => ({
        ticket_code: t.ticket_code,
        ticket_type_name: ttMap.get(t.ticket_type_id)?.name || "Ticket",
        merch_size: t.merch_size,
      })),
    }).catch(() => {
      // Silently catch — email failure must never affect the order response
    });

    // Revalidate pages
    if (event.slug) {
      revalidatePath(`/event/${event.slug}`);
    }
    revalidatePath("/admin/orders");
    revalidatePath("/admin/events");

    // Fetch the full order with relations to return
    const { data: fullOrder } = await supabase
      .from(TABLES.ORDERS)
      .select(`
        *,
        order_items (*, ticket_type:ticket_types(*)),
        tickets (*),
        customer:customers(*)
      `)
      .eq("id", order.id)
      .single();

    return NextResponse.json({ data: fullOrder });
  } catch (err) {
    console.error("Confirm order error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to confirm order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
