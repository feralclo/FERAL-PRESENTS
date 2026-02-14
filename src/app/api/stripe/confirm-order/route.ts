import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { createOrder, OrderCreationError, type OrderVat } from "@/lib/orders";

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

    // Determine connected account for PaymentIntent retrieval.
    // Priority: 1) event-level stripe_account_id  2) global setting  3) platform account
    // The client can pass stripe_account_id or event_id to help route correctly.
    let stripeAccountId: string | null = body.stripe_account_id || null;

    // If client passed event_id (or we can infer it), look up event-level Stripe account
    if (!stripeAccountId && body.event_id) {
      const { data: eventRow } = await supabase
        .from(TABLES.EVENTS)
        .select("stripe_account_id")
        .eq("id", body.event_id)
        .eq("org_id", ORG_ID)
        .single();
      if (eventRow?.stripe_account_id) {
        stripeAccountId = eventRow.stripe_account_id;
      }
    }

    // Fall back to global setting
    if (!stripeAccountId) {
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
    }

    // Validate the connected account is accessible before using it
    stripeAccountId = await verifyConnectedAccount(stripeAccountId);

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
          tickets (*, ticket_type:ticket_types(name)),
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

    // Extract VAT info from PaymentIntent metadata (set by payment-intent route)
    let vatInfo: OrderVat | undefined;
    if (metadata.vat_amount && Number(metadata.vat_amount) > 0) {
      vatInfo = {
        amount: Number(metadata.vat_amount),
        rate: Number(metadata.vat_rate || 0),
        inclusive: metadata.vat_inclusive === "true",
      };
    }

    // Create order via shared function
    const result = await createOrder({
      supabase,
      orgId,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        currency: event.currency,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
      },
      items,
      customer: {
        email: customerEmail,
        first_name: customerFirstName,
        last_name: customerLastName,
        phone: customerPhone,
      },
      payment: {
        method: "stripe",
        ref: payment_intent_id,
        totalCharged: paymentIntent.amount / 100,
      },
      vat: vatInfo,
    });

    // Fetch the full order with relations to return
    const { data: fullOrder } = await supabase
      .from(TABLES.ORDERS)
      .select(`
        *,
        order_items (*, ticket_type:ticket_types(*)),
        tickets (*, ticket_type:ticket_types(name)),
        customer:customers(*)
      `)
      .eq("id", result.order.id)
      .single();

    return NextResponse.json({ data: fullOrder });
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error("Confirm order error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to confirm order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
