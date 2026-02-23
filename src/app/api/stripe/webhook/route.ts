import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createOrder, type OrderVat, type OrderDiscount } from "@/lib/orders";
import { fetchMarketingSettings, hashSHA256, sendMetaEvents } from "@/lib/meta";
import type { MetaEventPayload } from "@/types/marketing";

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

    // Verify webhook signature — required in production to prevent forged events
    if (!webhookSecret) {
      if (process.env.NODE_ENV === "production") {
        console.error("STRIPE_WEBHOOK_SECRET is required in production");
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 500 }
        );
      }
      // Dev/test only: accept unverified events with warning
      console.warn("[webhook] No STRIPE_WEBHOOK_SECRET — accepting unverified event (dev only)");
      event = JSON.parse(body) as Stripe.Event;
    } else {
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
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const fallbackOrgId = getOrgIdFromRequest(request);
        await handlePaymentSuccess(paymentIntent, fallbackOrgId);
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
 * Delegates to the shared createOrder() function.
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, fallbackOrgId: string) {
  const metadata = paymentIntent.metadata;
  const eventId = metadata.event_id;
  const orgId = metadata.org_id || fallbackOrgId;
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

  const supabase = await getSupabaseAdmin();
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

  // Fetch event (include venue/date fields for order confirmation email)
  const { data: event } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name, slug, currency, venue_name, date_start, doors_time")
    .eq("id", eventId)
    .eq("org_id", orgId)
    .single();

  if (!event) {
    console.error(`Event ${eventId} not found for webhook`);
    return;
  }

  // Extract VAT info from PaymentIntent metadata
  let vatInfo: OrderVat | undefined;
  if (metadata.vat_amount && Number(metadata.vat_amount) > 0) {
    vatInfo = {
      amount: Number(metadata.vat_amount),
      rate: Number(metadata.vat_rate || 0),
      inclusive: metadata.vat_inclusive === "true",
    };
  }

  // Extract discount info from PaymentIntent metadata
  let discountInfo: OrderDiscount | undefined;
  if (metadata.discount_code && metadata.discount_amount) {
    discountInfo = {
      code: metadata.discount_code,
      amount: Number(metadata.discount_amount),
      type: metadata.discount_type || undefined,
      value: metadata.discount_value ? Number(metadata.discount_value) : undefined,
    };
  }

  try {
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
        ref: paymentIntent.id,
        totalCharged: paymentIntent.amount / 100,
      },
      vat: vatInfo,
      discountCode: metadata.discount_code || undefined,
      discount: discountInfo,
    });

    console.log(
      `Order ${result.order.order_number} created for PI ${paymentIntent.id} (${result.tickets.length} tickets)`
    );

    // Fire server-side CAPI Purchase event as backup
    // Uses deterministic event_id for dedup with client pixel + confirm-order CAPI
    fireWebhookPurchaseEvent({
      orderNumber: result.order.order_number,
      total: paymentIntent.amount / 100,
      currency: event.currency || "GBP",
      ticketTypeIds: items.map((i) => i.ticket_type_id),
      numItems: items.reduce((sum, i) => sum + i.qty, 0),
      customerEmail,
      customerFirstName,
      customerLastName,
      customerPhone,
      customerId: result.order.customer_id,
      eventSlug: event.slug,
    }).catch((err) => console.error("[Meta CAPI] Webhook Purchase error:", err));
  } catch (err) {
    console.error("Failed to create order for PI:", paymentIntent.id, err);
  }
}

/**
 * Fire server-side CAPI Purchase from webhook (backup path).
 * Uses same deterministic event_id as confirm-order and client pixel.
 */
async function fireWebhookPurchaseEvent(data: {
  orderNumber: string;
  total: number;
  currency: string;
  ticketTypeIds: string[];
  numItems: number;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerPhone?: string;
  customerId?: string;
  eventSlug: string;
}) {
  const settings = await fetchMarketingSettings();
  if (!settings?.meta_tracking_enabled || !settings.meta_pixel_id || !settings.meta_capi_token) {
    return;
  }

  const eventId = `purchase-${data.orderNumber}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  const event: MetaEventPayload = {
    event_name: "Purchase",
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: `${siteUrl}/event/${data.eventSlug}/checkout/`,
    action_source: "website",
    user_data: {
      ...(data.customerEmail && { em: hashSHA256(data.customerEmail) }),
      ...(data.customerFirstName && { fn: hashSHA256(data.customerFirstName) }),
      ...(data.customerLastName && { ln: hashSHA256(data.customerLastName) }),
      ...(data.customerPhone && { ph: hashSHA256(data.customerPhone) }),
      ...(data.customerId && { external_id: hashSHA256(data.customerId) }),
    },
    custom_data: {
      content_ids: data.ticketTypeIds,
      content_type: "product",
      content_category: "Events",
      value: data.total,
      currency: data.currency,
      num_items: data.numItems,
      order_id: data.orderNumber,
    },
  };

  const result = await sendMetaEvents(
    settings.meta_pixel_id,
    settings.meta_capi_token,
    [event],
    settings.meta_test_event_code || undefined
  );

  if (result?.error) {
    console.error("[Meta CAPI] Webhook Purchase failed:", result.error);
  } else {
    console.log("[Meta CAPI] Webhook Purchase sent:", eventId);
  }
}
