import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createOrder, OrderCreationError, type OrderVat, type OrderDiscount } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { fetchMarketingSettings, hashSHA256, sendMetaEvents } from "@/lib/meta";
import { logPaymentEvent, getClientIp } from "@/lib/payment-monitor";
import type { MetaEventPayload } from "@/types/marketing";

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
    const orgId = getOrgIdFromRequest(request);
    const stripe = getStripe();
    const body = await request.json();
    const { payment_intent_id } = body;

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: "Missing payment_intent_id" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
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
        .eq("org_id", orgId)
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
        .eq("key", stripeAccountKey(orgId))
        .single();

      if (settingsRow?.data && typeof settingsRow.data === "object") {
        const settingsData = settingsRow.data as { account_id?: string };
        if (settingsData.account_id) {
          stripeAccountId = settingsData.account_id;
        }
      }
    }

    // Validate the connected account is accessible before using it
    stripeAccountId = await verifyConnectedAccount(stripeAccountId, orgId);

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
      .eq("org_id", orgId)
      .single();

    if (existingOrder) {
      // Order already created — fetch and return it
      const { data: fullOrder } = await supabase
        .from(TABLES.ORDERS)
        .select(`
          *,
          order_items (*, ticket_type:ticket_types(*)),
          tickets (*, ticket_type:ticket_types(name, merch_name, product:products(name))),
          customer:customers(*)
        `)
        .eq("id", existingOrder.id)
        .single();

      // Safety net: if the order exists but the confirmation email was never
      // sent (e.g. the webhook created the order but its serverless function
      // was terminated before the email completed), send it now.
      if (fullOrder) {
        const meta = (fullOrder.metadata || {}) as Record<string, unknown>;
        if (meta.email_sent !== true) {
          const orderCustomer = fullOrder.customer as { email?: string; first_name?: string; last_name?: string } | null;
          const orderEvent = await supabase
            .from(TABLES.EVENTS)
            .select("id, name, slug, currency, venue_name, date_start, doors_time")
            .eq("id", fullOrder.event_id)
            .eq("org_id", orgId)
            .single();

          if (orderCustomer?.email && orderEvent?.data) {
            const ev = orderEvent.data;
            const tickets = (fullOrder.tickets || []) as { ticket_code: string; ticket_type?: { name?: string; merch_name?: string; product?: { name?: string } | null } | null; merch_size?: string }[];
            try {
              await sendOrderConfirmationEmail({
                orgId,
                order: {
                  id: fullOrder.id,
                  order_number: fullOrder.order_number,
                  total: Number(fullOrder.total),
                  currency: (fullOrder.currency || ev.currency || "GBP").toUpperCase(),
                },
                customer: {
                  first_name: orderCustomer.first_name || "",
                  last_name: orderCustomer.last_name || "",
                  email: orderCustomer.email,
                },
                event: {
                  name: ev.name,
                  slug: ev.slug,
                  venue_name: ev.venue_name,
                  date_start: ev.date_start,
                  doors_time: ev.doors_time,
                  currency: ev.currency,
                },
                tickets: tickets.map((t) => ({
                  ticket_code: t.ticket_code,
                  ticket_type_name: t.ticket_type?.name || "Ticket",
                  merch_size: t.merch_size,
                  merch_name: t.merch_size
                    ? t.ticket_type?.product?.name || t.ticket_type?.merch_name || undefined
                    : undefined,
                })),
              });
              console.log(`[confirm-order] Safety net: sent missing email for existing order ${fullOrder.order_number}`);
            } catch {
              console.error(`[confirm-order] Safety net: failed to send email for order ${fullOrder.order_number}`);
            }
          }
        }
      }

      return NextResponse.json({ data: fullOrder });
    }

    // Extract metadata from the PaymentIntent
    const metadata = paymentIntent.metadata;
    const eventId = metadata.event_id;
    const metaOrgId = metadata.org_id || orgId;
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
      .eq("org_id", metaOrgId)
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

    // Extract marketing consent from PI metadata
    const customerMarketingConsent = metadata.customer_marketing_consent !== undefined
      ? metadata.customer_marketing_consent === "true"
      : undefined;

    // Extract multi-currency conversion metadata
    let conversionInfo: {
      baseCurrency: string;
      baseTotal: number;
      exchangeRate: number;
      rateLocked: string;
    } | undefined;
    if (metadata.base_currency && metadata.exchange_rate) {
      conversionInfo = {
        baseCurrency: metadata.base_currency,
        baseTotal: Number(metadata.base_total || metadata.base_subtotal || 0),
        exchangeRate: Number(metadata.exchange_rate),
        rateLocked: metadata.rate_locked_at || new Date().toISOString(),
      };
    }

    // Create order via shared function
    const result = await createOrder({
      supabase,
      orgId: metaOrgId,
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
        marketing_consent: customerMarketingConsent,
      },
      payment: {
        method: "stripe",
        ref: payment_intent_id,
        totalCharged: paymentIntent.amount / 100,
      },
      vat: vatInfo,
      discountCode: metadata.discount_code || undefined,
      discount: discountInfo,
      conversion: conversionInfo,
      presentmentCurrency: metadata.presentment_currency || undefined,
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

    // ── Server-side CAPI Purchase event ──
    // Fire in the background — don't block the response.
    // Uses deterministic event_id (`purchase-{order_number}`) so Meta
    // deduplicates with the client-side pixel Purchase event.
    fireServerPurchaseEvent(request, metaOrgId, {
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
      eventSourceUrl: request.headers.get("referer") || `${process.env.NEXT_PUBLIC_SITE_URL || ""}/event/${event.slug}/checkout/`,
    }).catch((err) => console.error("[Meta CAPI] Server Purchase error:", err));

    return NextResponse.json({ data: fullOrder });
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error("Confirm order error:", err);
    logPaymentEvent({
      orgId: getOrgIdFromRequest(request),
      type: "checkout_error",
      severity: "critical",
      errorCode: err instanceof Error ? err.name : "unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
      ipAddress: getClientIp(request),
    });
    const message =
      err instanceof Error ? err.message : "Failed to confirm order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fire a server-side CAPI Purchase event with full customer PII.
 * Uses deterministic event_id for deduplication with client pixel.
 */
async function fireServerPurchaseEvent(
  request: NextRequest,
  orgId: string,
  data: {
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
    eventSourceUrl: string;
  }
) {
  const settings = await fetchMarketingSettings(orgId);
  if (!settings?.meta_tracking_enabled || !settings.meta_pixel_id || !settings.meta_capi_token) {
    return;
  }

  // Server-side signals
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || undefined;
  const clientUa = request.headers.get("user-agent") || undefined;

  // Deterministic event_id — matches client-side pixel Purchase event
  const eventId = `purchase-${data.orderNumber}`;

  const event: MetaEventPayload = {
    event_name: "Purchase",
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: data.eventSourceUrl,
    action_source: "website",
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: clientUa,
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
    console.error("[Meta CAPI] Server Purchase failed:", result.error);
  } else {
    console.log("[Meta CAPI] Server Purchase sent:", eventId, "events_received:", result?.events_received);
  }
}
