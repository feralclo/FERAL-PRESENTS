import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey, vatKey } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import {
  calculateApplicationFee,
  toSmallestUnit,
} from "@/lib/stripe/config";
import { getOrgPlan } from "@/lib/plans";
import { calculateCheckoutVat, DEFAULT_VAT_SETTINGS } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";
import { createRateLimiter } from "@/lib/rate-limit";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import { logPaymentEvent, getClientIp } from "@/lib/payment-monitor";
import { ensureMerchPassTicketType } from "@/lib/merch-orders";

const paymentLimiter = createRateLimiter("merch-payment-intent", {
  limit: 10,
  windowSeconds: 60,
  onBlocked: (ip) => {
    logPaymentEvent({
      orgId: "unknown",
      type: "rate_limit_hit",
      ipAddress: ip,
      errorMessage: "Merch payment intent rate limit exceeded",
      metadata: { limiter: "merch-payment-intent", limit: 10, window_seconds: 60 },
    });
  },
});

/**
 * POST /api/merch-store/payment-intent
 *
 * Creates a Stripe PaymentIntent for a merch pre-order.
 * Similar to /api/stripe/payment-intent but uses collection item prices
 * instead of ticket type prices.
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = paymentLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const stripe = getStripe();
    const body = await request.json();
    const { collection_slug, items, customer } = body;

    if (!collection_slug || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: collection_slug, items[]" },
        { status: 400 }
      );
    }
    if (!customer?.email || !customer?.first_name || !customer?.last_name) {
      return NextResponse.json(
        { error: "Missing customer fields: email, first_name, last_name" },
        { status: 400 }
      );
    }

    if (isRestrictedCheckoutEmail(customer.email)) {
      return NextResponse.json(
        { error: "Payment processing temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch the collection with its event
    const { data: collection, error: collErr } = await supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .select("*, event:events(id, name, slug, payment_method, currency, stripe_account_id, vat_registered, vat_rate, vat_prices_include, vat_number)")
      .eq("slug", collection_slug)
      .eq("org_id", orgId)
      .eq("status", "active")
      .single();

    if (collErr || !collection) {
      return NextResponse.json(
        { error: "Collection not found or not active" },
        { status: 404 }
      );
    }

    const event = collection.event;
    if (!event) {
      return NextResponse.json(
        { error: "Event not found for this collection" },
        { status: 404 }
      );
    }

    if (event.payment_method !== "stripe") {
      return NextResponse.json(
        { error: "This event does not use Stripe payments" },
        { status: 400 }
      );
    }

    // Fetch collection items with products
    const itemIds = items.map((i: { collection_item_id: string }) => i.collection_item_id);
    const { data: collectionItems, error: ciErr } = await supabase
      .from(TABLES.MERCH_COLLECTION_ITEMS)
      .select("*, product:products(*)")
      .eq("org_id", orgId)
      .eq("collection_id", collection.id)
      .in("id", itemIds);

    if (ciErr || !collectionItems) {
      return NextResponse.json(
        { error: "Failed to fetch collection items" },
        { status: 500 }
      );
    }

    const ciMap = new Map(collectionItems.map((ci: { id: string }) => [ci.id, ci]));

    // Validate items and calculate subtotal
    let subtotal = 0;
    const validatedItems: {
      collection_item_id: string;
      product_id: string;
      product_name: string;
      qty: number;
      unit_price: number;
      merch_size?: string;
    }[] = [];

    for (const item of items as { collection_item_id: string; qty: number; merch_size?: string }[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ci = ciMap.get(item.collection_item_id) as any;
      if (!ci) {
        return NextResponse.json(
          { error: `Collection item ${item.collection_item_id} not found` },
          { status: 400 }
        );
      }

      // Enforce max_per_order
      if (ci.max_per_order !== null && item.qty > ci.max_per_order) {
        return NextResponse.json(
          { error: `Maximum ${ci.max_per_order} per order for "${ci.product?.name || "item"}"` },
          { status: 400 }
        );
      }

      // Validate size if product has sizes
      if (ci.product?.sizes?.length > 0 && !item.merch_size) {
        return NextResponse.json(
          { error: `Size required for "${ci.product?.name || "item"}"` },
          { status: 400 }
        );
      }

      const price = ci.custom_price ?? ci.product?.price ?? 0;
      subtotal += price * item.qty;

      validatedItems.push({
        collection_item_id: item.collection_item_id,
        product_id: ci.product_id,
        product_name: ci.product?.name || "Merch Item",
        qty: item.qty,
        unit_price: price,
        merch_size: item.merch_size,
      });
    }

    if (subtotal <= 0) {
      return NextResponse.json(
        { error: "Order total must be greater than zero" },
        { status: 400 }
      );
    }

    // Determine connected Stripe account
    let stripeAccountId: string | null = event.stripe_account_id || null;

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

    // Resolve VAT (same 3-tier logic as ticket checkout)
    let vatAmount = 0;
    let vatRate = 0;
    let vatInclusive = true;

    if (event.vat_registered === true) {
      const evtRate = event.vat_rate ?? 20;
      const evtInclusive = event.vat_prices_include ?? true;
      if (evtRate > 0) {
        vatRate = evtRate;
        vatInclusive = evtInclusive;
        const vat: VatSettings = {
          vat_registered: true,
          vat_number: event.vat_number || "",
          vat_rate: evtRate,
          prices_include_vat: evtInclusive,
        };
        const breakdown = calculateCheckoutVat(subtotal, vat);
        if (breakdown) vatAmount = breakdown.vat;
      }
    } else if (event.vat_registered == null) {
      const { data: vatRow } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", vatKey(orgId))
        .single();

      if (vatRow?.data) {
        const vat: VatSettings = { ...DEFAULT_VAT_SETTINGS, ...(vatRow.data as Partial<VatSettings>) };
        if (vat.vat_registered && vat.vat_rate > 0) {
          vatRate = vat.vat_rate;
          vatInclusive = vat.prices_include_vat;
          const breakdown = calculateCheckoutVat(subtotal, vat);
          if (breakdown) vatAmount = breakdown.vat;
        }
      }
    }

    const chargeAmount = vatInclusive ? subtotal : subtotal + vatAmount;
    const amountInSmallestUnit = toSmallestUnit(chargeAmount);
    const currency = (event.currency || "GBP").toLowerCase();

    // Get plan fees
    const plan = await getOrgPlan(orgId);
    const applicationFee = calculateApplicationFee(amountInSmallestUnit, plan.fee_percent, plan.min_fee);

    // Ensure merch pass ticket type exists
    const merchPassTicketTypeId = await ensureMerchPassTicketType(supabase, orgId, event.id);

    // Build description
    const description = validatedItems
      .map((item) => `${item.qty}x ${item.product_name}${item.merch_size ? ` (${item.merch_size})` : ""}`)
      .join(", ");

    // Store order details in metadata
    const metadata: Record<string, string> = {
      order_type: "merch_preorder",
      event_id: event.id,
      event_slug: event.slug,
      org_id: orgId,
      collection_id: collection.id,
      collection_slug: collection.slug,
      collection_title: collection.title,
      merch_pass_ticket_type_id: merchPassTicketTypeId,
      customer_email: customer.email.toLowerCase(),
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone || "",
      items_json: JSON.stringify(validatedItems),
    };

    if (typeof customer.marketing_consent === "boolean") {
      metadata.customer_marketing_consent = customer.marketing_consent ? "true" : "false";
    }

    if (vatAmount > 0) {
      metadata.vat_amount = String(vatAmount);
      metadata.vat_rate = String(vatRate);
      metadata.vat_inclusive = vatInclusive ? "true" : "false";
    }

    // Create PaymentIntent
    if (stripeAccountId) {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInSmallestUnit,
          currency,
          application_fee_amount: applicationFee,
          description: `Merch Pre-order — ${description}`,
          metadata,
          automatic_payment_methods: { enabled: true },
        },
        { stripeAccount: stripeAccountId }
      );

      return NextResponse.json({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        stripe_account_id: stripeAccountId,
        amount: amountInSmallestUnit,
        currency,
        application_fee: applicationFee,
        subtotal,
        vat: vatAmount > 0 ? { amount: vatAmount, rate: vatRate, inclusive: vatInclusive } : null,
      });
    }

    // Platform-only charge
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency,
      description: `Merch Pre-order — ${description}`,
      metadata,
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_account_id: null,
      amount: amountInSmallestUnit,
      currency,
      application_fee: 0,
      subtotal,
      vat: vatAmount > 0 ? { amount: vatAmount, rate: vatRate, inclusive: vatInclusive } : null,
    });
  } catch (err) {
    console.error("Merch PaymentIntent creation error:", err);
    logPaymentEvent({
      orgId: getOrgIdFromRequest(request),
      type: "checkout_error",
      severity: "critical",
      errorCode: err instanceof Error ? err.name : "unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
      ipAddress: getClientIp(request),
    });
    const message =
      err instanceof Error ? err.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
