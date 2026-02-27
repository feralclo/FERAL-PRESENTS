import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createMerchOrder, MerchOrderError } from "@/lib/merch-orders";
import type { MerchOrderVat, MerchOrderLineItem } from "@/lib/merch-orders";
import { logPaymentEvent, getClientIp } from "@/lib/payment-monitor";

/**
 * POST /api/merch-store/confirm-order
 *
 * Called by the merch checkout after Stripe payment succeeds on the client.
 * Verifies the PaymentIntent, then creates the merch order + tickets.
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

    // Determine connected account
    let stripeAccountId: string | null = body.stripe_account_id || null;

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

    stripeAccountId = await verifyConnectedAccount(stripeAccountId, orgId);

    // Retrieve PaymentIntent from Stripe
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

    // Check idempotency — order may already exist
    const { data: existingOrder } = await supabase
      .from(TABLES.ORDERS)
      .select("id")
      .eq("payment_ref", payment_intent_id)
      .eq("org_id", orgId)
      .single();

    if (existingOrder) {
      const { data: fullOrder } = await supabase
        .from(TABLES.ORDERS)
        .select(`
          *,
          order_items (*),
          tickets (ticket_code, merch_size),
          customer:customers(*)
        `)
        .eq("id", existingOrder.id)
        .single();

      return NextResponse.json({ data: fullOrder });
    }

    // Extract metadata from PaymentIntent
    const metadata = paymentIntent.metadata;
    const eventId = metadata.event_id;
    const metaOrgId = metadata.org_id || orgId;
    const collectionId = metadata.collection_id;
    const collectionTitle = metadata.collection_title;
    const merchPassTicketTypeId = metadata.merch_pass_ticket_type_id;
    const customerEmail = metadata.customer_email;
    const customerFirstName = metadata.customer_first_name;
    const customerLastName = metadata.customer_last_name;
    const customerPhone = metadata.customer_phone;
    const itemsJson = metadata.items_json;

    if (!eventId || !customerEmail || !itemsJson || !collectionId || !merchPassTicketTypeId) {
      return NextResponse.json(
        { error: "PaymentIntent missing required metadata" },
        { status: 400 }
      );
    }

    const items: MerchOrderLineItem[] = JSON.parse(itemsJson);

    // Fetch event
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

    // Extract VAT info
    let vatInfo: MerchOrderVat | undefined;
    if (metadata.vat_amount && Number(metadata.vat_amount) > 0) {
      vatInfo = {
        amount: Number(metadata.vat_amount),
        rate: Number(metadata.vat_rate || 0),
        inclusive: metadata.vat_inclusive === "true",
      };
    }

    // Extract marketing consent
    const customerMarketingConsent = metadata.customer_marketing_consent !== undefined
      ? metadata.customer_marketing_consent === "true"
      : undefined;

    // Extract multi-currency conversion info
    let conversion: { baseCurrency: string; baseTotal: number; exchangeRate: number; rateLocked: string } | undefined;
    if (metadata.exchange_rate && metadata.base_currency) {
      conversion = {
        baseCurrency: metadata.base_currency,
        baseTotal: Number(metadata.base_total || 0),
        exchangeRate: Number(metadata.exchange_rate),
        rateLocked: metadata.rate_locked_at || new Date().toISOString(),
      };
    }

    // Create merch order
    const result = await createMerchOrder({
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
      collectionId,
      collectionTitle: collectionTitle || "Merch Collection",
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
      merchPassTicketTypeId,
      vat: vatInfo,
      conversion,
      presentmentCurrency: metadata.presentment_currency || undefined,
    });

    // Fetch full order for response
    const { data: fullOrder } = await supabase
      .from(TABLES.ORDERS)
      .select(`
        *,
        order_items (*),
        tickets (ticket_code, merch_size),
        customer:customers(*)
      `)
      .eq("id", result.order.id)
      .single();

    return NextResponse.json({ data: fullOrder });
  } catch (err) {
    if (err instanceof MerchOrderError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error("Merch confirm order error:", err);
    logPaymentEvent({
      orgId: getOrgIdFromRequest(request),
      type: "checkout_error",
      severity: "critical",
      errorCode: err instanceof Error ? err.name : "unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
      ipAddress: getClientIp(request),
    });
    const message =
      err instanceof Error ? err.message : "Failed to confirm merch order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
