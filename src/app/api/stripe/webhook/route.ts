import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  generateOrderNumber,
  generateTicketCode,
} from "@/lib/ticket-utils";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events for payment processing.
 * Key events:
 * - payment_intent.succeeded: Create order + tickets
 * - payment_intent.payment_failed: Log failure
 *
 * For Connect direct charges, webhooks fire on the platform account
 * with the connected account context in the event.
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.text();

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = request.headers.get("stripe-signature");
      if (!signature) {
        return NextResponse.json(
          { error: "Missing stripe-signature header" },
          { status: 400 }
        );
      }
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 }
        );
      }
    } else {
      // No webhook secret configured — parse the event directly (dev/test only)
      event = JSON.parse(body) as Stripe.Event;
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSuccess(paymentIntent);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.error(
          `Payment failed for PI ${paymentIntent.id}:`,
          paymentIntent.last_payment_error?.message
        );
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle a successful payment: create order, tickets, update stats.
 * This mirrors the logic in POST /api/orders but triggered by Stripe.
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata;
  const eventId = metadata.event_id;
  const orgId = metadata.org_id || ORG_ID;
  const customerEmail = metadata.customer_email;
  const customerFirstName = metadata.customer_first_name;
  const customerLastName = metadata.customer_last_name;
  const customerPhone = metadata.customer_phone;
  const itemsJson = metadata.items_json;

  if (!eventId || !customerEmail || !itemsJson) {
    console.error("Webhook missing required metadata:", metadata);
    return;
  }

  const items: { ticket_type_id: string; qty: number; merch_size?: string }[] =
    JSON.parse(itemsJson);

  const supabase = await getSupabaseServer();
  if (!supabase) {
    console.error("Supabase not configured for webhook handler");
    return;
  }

  // Check if order already exists for this payment (idempotency)
  const { data: existingOrder } = await supabase
    .from(TABLES.ORDERS)
    .select("id")
    .eq("payment_ref", paymentIntent.id)
    .eq("org_id", orgId)
    .single();

  if (existingOrder) {
    // Order already created — idempotent, skip
    return;
  }

  // Fetch event
  const { data: event } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name, slug, payment_method, currency")
    .eq("id", eventId)
    .eq("org_id", orgId)
    .single();

  if (!event) {
    console.error(`Event ${eventId} not found for webhook`);
    return;
  }

  // Fetch ticket types
  const ticketTypeIds = items.map((i) => i.ticket_type_id);
  const { data: ticketTypes } = await supabase
    .from(TABLES.TICKET_TYPES)
    .select("*")
    .eq("org_id", orgId)
    .in("id", ticketTypeIds);

  if (!ticketTypes) {
    console.error("Failed to fetch ticket types for webhook");
    return;
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
      console.error("Failed to create customer in webhook:", custErr);
      return;
    }
    customerId = newCustomer.id;
  }

  // Calculate totals
  let subtotal = 0;
  for (const item of items) {
    const tt = ttMap.get(item.ticket_type_id);
    if (tt) subtotal += Number(tt.price) * item.qty;
  }

  const total = paymentIntent.amount / 100; // Convert from smallest unit
  const fees = total - subtotal; // Any difference is fees

  // Create order with retry
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
        payment_ref: paymentIntent.id,
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
    console.error("Order creation failed in webhook:", error);
    break;
  }

  if (!order) {
    console.error("Failed to create order for PI:", paymentIntent.id);
    return;
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

  // Revalidate pages
  if (event.slug) {
    revalidatePath(`/event/${event.slug}`);
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin/events");

  console.log(
    `Order ${order.order_number} created for PI ${paymentIntent.id} (${allTickets.length} tickets)`
  );
}
