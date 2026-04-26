import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey, vatKey } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import {
  calculateApplicationFee,
  toSmallestUnit,
  SUPPORTED_CURRENCIES,
  CROSS_CURRENCY_SURCHARGE_PERCENT,
  CURRENCY_FEE_OVERRIDES,
} from "@/lib/stripe/config";
import { getOrgBaseCurrency } from "@/lib/org-settings";
import {
  getExchangeRates,
  convertCurrency,
  roundPresentmentPrice,
  areRatesFreshForCheckout,
} from "@/lib/currency/exchange-rates";
import { getOrgPlan } from "@/lib/plans";
import { calculateCheckoutVat, DEFAULT_VAT_SETTINGS } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";
import { createRateLimiter } from "@/lib/rate-limit";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import { logPaymentEvent, getClientIp } from "@/lib/payment-monitor";
import { validateSequentialPurchase } from "@/lib/ticket-visibility";
import * as Sentry from "@sentry/nextjs";

// 10 payment intents per minute per IP — prevents abuse / cost attacks
const paymentLimiter = createRateLimiter("payment-intent", {
  limit: 10,
  windowSeconds: 60,
  onBlocked: (ip) => {
    logPaymentEvent({
      orgId: "unknown",
      type: "rate_limit_hit",
      ipAddress: ip,
      errorMessage: "Payment intent rate limit exceeded",
      metadata: { limiter: "payment-intent", limit: 10, window_seconds: 60 },
    });
  },
});

/**
 * POST /api/stripe/payment-intent
 *
 * Creates a Stripe PaymentIntent for a ticket purchase.
 * Rate limited: 10 requests per minute per IP.
 *
 * Connected account is auto-detected from site_settings (saved by Payment Settings page).
 * Platform fee uses the config default (DEFAULT_PLATFORM_FEE_PERCENT).
 *
 * When a connected account exists:
 *   → Direct charge on the connected account with application_fee_amount
 *   → Connected account is the merchant of record
 *
 * When no connected account:
 *   → Charge on the platform account directly
 *   → Platform is the merchant of record
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = paymentLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const stripe = getStripe();
    const body = await request.json();
    const { event_id, items, customer, discount_code, presentment_currency, test_order } = body;

    if (!event_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, items[]" },
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

    // Fetch event (include stripe_account_id for per-event Connect)
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, payment_method, currency, stripe_account_id, vat_registered, vat_rate, vat_prices_include, vat_number, tickets_live_at, settings_key")
      .eq("id", event_id)
      .eq("org_id", orgId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (event.tickets_live_at && new Date(event.tickets_live_at) > new Date()) {
      return NextResponse.json(
        { error: "Tickets are not yet on sale" },
        { status: 400 }
      );
    }

    if (event.payment_method !== "stripe") {
      return NextResponse.json(
        { error: "This event does not use Stripe payments" },
        { status: 400 }
      );
    }

    // Determine connected account: event-level stripe_account_id takes priority,
    // then fall back to global setting in site_settings.
    // This enables multi-tenant payments: each event/promoter can use their own Stripe account.
    let stripeAccountId: string | null = event.stripe_account_id || null;
    // Track whether the org/event explicitly asked for a connected account.
    // Critical for the post-verifyConnectedAccount check below: if a tenant
    // configured an account but it's now unhealthy (deleted, revoked, or
    // lacking the card_payments capability — e.g. KYC not finished), we
    // MUST NOT silently route the charge to the platform Stripe. That
    // would attribute money to Entry instead of the tenant. Fail loudly
    // with a clear buyer-facing error instead.
    const hadConfiguredStripeAccount = !!stripeAccountId;

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

    const orgHasConfiguredStripeAccount =
      hadConfiguredStripeAccount || !!stripeAccountId;

    // Validate the connected account is accessible AND active. If the
    // account was deleted, revoked, or hasn't completed enough KYC for
    // card_payments to be active, this returns null.
    stripeAccountId = await verifyConnectedAccount(stripeAccountId, orgId);

    if (orgHasConfiguredStripeAccount && !stripeAccountId) {
      // Tenant configured Stripe but their account isn't ready (most likely
      // KYC unfinished). Don't fall back to platform — that would route
      // their tenant's revenue to Entry. Fail with a clear buyer error so
      // the tenant gets the signal to fix their setup.
      return NextResponse.json(
        {
          error:
            "This organiser is finishing their payment setup. Please try again shortly or contact them directly.",
          error_code: "connected_account_unhealthy",
        },
        { status: 503 }
      );
    }

    // Verify ticket types and calculate total
    const ticketTypeIds = items.map(
      (item: { ticket_type_id: string }) => item.ticket_type_id
    );
    const { data: ticketTypes, error: ttErr } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("*")
      .eq("org_id", orgId)
      .in("id", ticketTypeIds);

    if (ttErr || !ticketTypes) {
      return NextResponse.json(
        { error: "Failed to fetch ticket types" },
        { status: 500 }
      );
    }

    const ttMap = new Map(ticketTypes.map((tt) => [tt.id, tt]));

    // Check availability and calculate total
    let subtotal = 0;
    for (const item of items as { ticket_type_id: string; qty: number }[]) {
      const tt = ttMap.get(item.ticket_type_id);
      if (!tt) {
        return NextResponse.json(
          { error: `Ticket type ${item.ticket_type_id} not found` },
          { status: 400 }
        );
      }
      if (tt.capacity !== null && tt.sold + item.qty > tt.capacity) {
        logPaymentEvent({
          orgId,
          type: "checkout_validation",
          severity: "info",
          eventId: event_id,
          errorCode: "sold_out",
          errorMessage: `Not enough tickets for "${tt.name}". Available: ${tt.capacity - tt.sold}, requested: ${item.qty}`,
          customerEmail: customer?.email,
          ipAddress: getClientIp(request),
        });
        return NextResponse.json(
          {
            error: `Not enough tickets available for "${tt.name}". Available: ${tt.capacity - tt.sold}`,
          },
          { status: 400 }
        );
      }
      subtotal += Number(tt.price) * item.qty;
    }

    // Validate sequential release rules — prevent purchasing hidden tickets
    // Settings key: event.settings_key (custom) or {orgId}_event_{slug}
    const eventSettingsKey = (event as { settings_key?: string }).settings_key || `${orgId}_event_${event.slug}`;
    const { data: eventSettingsRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", eventSettingsKey)
      .single();

    const eventSettings = eventSettingsRow?.data as {
      ticket_group_map?: Record<string, string | null>;
      ticket_group_release_mode?: Record<string, "all" | "sequential">;
    } | null;

    if (eventSettings?.ticket_group_release_mode) {
      for (const item of items as { ticket_type_id: string; qty: number }[]) {
        const tt = ttMap.get(item.ticket_type_id);
        if (!tt) continue;
        const error = validateSequentialPurchase(
          tt,
          ticketTypes,
          eventSettings.ticket_group_map,
          eventSettings.ticket_group_release_mode,
        );
        if (error) {
          return NextResponse.json({ error }, { status: 400 });
        }
      }
    }

    // Validate and apply discount code if provided
    let discountAmount = 0;
    let discountMeta: { code: string; type: string; value: number; amount: number } | null = null;

    if (discount_code && typeof discount_code === "string" && discount_code.trim()) {
      const { data: discount } = await supabase
        .from(TABLES.DISCOUNTS)
        .select("*")
        .eq("org_id", orgId)
        .ilike("code", discount_code.trim())
        .eq("status", "active")
        .single();

      if (!discount) {
        return NextResponse.json(
          { error: "Invalid discount code" },
          { status: 400 }
        );
      }

      const now = new Date();
      if (discount.starts_at && new Date(discount.starts_at) > now) {
        return NextResponse.json(
          { error: "Discount code is not yet active" },
          { status: 400 }
        );
      }
      if (discount.expires_at && new Date(discount.expires_at) < now) {
        return NextResponse.json(
          { error: "Discount code has expired" },
          { status: 400 }
        );
      }
      if (discount.max_uses != null && discount.used_count >= discount.max_uses) {
        return NextResponse.json(
          { error: "Discount code has reached its usage limit" },
          { status: 400 }
        );
      }
      if (
        discount.applicable_event_ids &&
        discount.applicable_event_ids.length > 0 &&
        !discount.applicable_event_ids.includes(event_id)
      ) {
        return NextResponse.json(
          { error: "Discount code is not valid for this event" },
          { status: 400 }
        );
      }
      if (discount.min_order_amount != null && subtotal < discount.min_order_amount) {
        const { formatPrice } = await import("@/lib/stripe/config");
        return NextResponse.json(
          { error: `Minimum order of ${formatPrice(Number(discount.min_order_amount), event.currency || "GBP")} required` },
          { status: 400 }
        );
      }

      // Calculate discount
      if (discount.type === "percentage") {
        discountAmount = Math.round((subtotal * discount.value) / 100 * 100) / 100;
      } else {
        discountAmount = Math.min(discount.value, subtotal);
      }

      discountMeta = {
        code: discount.code,
        type: discount.type,
        value: discount.value,
        amount: discountAmount,
      };
    }

    const afterDiscount = Math.max(subtotal - discountAmount, 0);

    // ── Multi-currency conversion ──────────────────────────────────────
    // When presentment_currency differs from the event's base currency,
    // convert the entire charge to the buyer's preferred currency.
    // Manual price_overrides per ticket type take priority over auto-conversion.
    const baseCurrency = (event.currency || "GBP").toLowerCase();
    let chargeCurrency = baseCurrency;
    let exchangeRate: number | null = null;
    let rateLocked: string | null = null;
    let convertedSubtotal = afterDiscount;
    let convertedDiscountAmount = discountAmount;
    let priceSource: "auto" | "override" | "mixed" = "auto";

    if (
      presentment_currency &&
      presentment_currency.toLowerCase() !== baseCurrency &&
      SUPPORTED_CURRENCIES.includes(presentment_currency.toLowerCase() as typeof SUPPORTED_CURRENCIES[number])
    ) {
      const pCurrency = presentment_currency.toUpperCase();
      const bCurrency = baseCurrency.toUpperCase();

      // Check if ALL items have overrides (skip rate fetch if so)
      const allHaveOverrides = (items as { ticket_type_id: string; qty: number }[]).every((item) => {
        const tt = ttMap.get(item.ticket_type_id);
        return tt?.price_overrides && pCurrency in (tt.price_overrides as Record<string, number>);
      });
      const anyHasOverride = (items as { ticket_type_id: string; qty: number }[]).some((item) => {
        const tt = ttMap.get(item.ticket_type_id);
        return tt?.price_overrides && pCurrency in (tt.price_overrides as Record<string, number>);
      });

      // Need rates if some items don't have overrides, or if there's a fixed discount to convert
      const hasFixedDiscount = discountAmount > 0 && discountMeta?.type === "fixed";
      const rates = (allHaveOverrides && !hasFixedDiscount) ? null : await getExchangeRates();
      const ratesValid = allHaveOverrides || (rates && areRatesFreshForCheckout(rates));

      if (ratesValid) {
        // Calculate per-item converted subtotal
        let perItemTotal = 0;
        for (const item of items as { ticket_type_id: string; qty: number }[]) {
          const tt = ttMap.get(item.ticket_type_id);
          if (!tt) continue;
          const overrides = tt.price_overrides as Record<string, number> | null;
          if (overrides && pCurrency in overrides) {
            perItemTotal += overrides[pCurrency] * item.qty;
          } else if (rates) {
            perItemTotal += roundPresentmentPrice(
              convertCurrency(Number(tt.price), bCurrency, pCurrency, rates)
            ) * item.qty;
          }
        }

        // Apply discount in presentment currency
        if (discountAmount > 0 && discountMeta) {
          if (discountMeta.type === "percentage") {
            convertedDiscountAmount = Math.round((perItemTotal * discountMeta.value) / 100 * 100) / 100;
          } else if (rates) {
            convertedDiscountAmount = roundPresentmentPrice(convertCurrency(discountAmount, bCurrency, pCurrency, rates));
          } else {
            // Fixed discount with all overrides but no rates — convert proportionally
            convertedDiscountAmount = roundPresentmentPrice(discountAmount * (perItemTotal / subtotal));
          }
        } else {
          convertedDiscountAmount = 0;
        }

        convertedSubtotal = Math.max(perItemTotal - convertedDiscountAmount, 0);

        // Calculate exchange rate for metadata
        if (rates) {
          const fromRate = rates.rates[bCurrency];
          const toRate = rates.rates[pCurrency];
          if (fromRate && toRate) {
            exchangeRate = toRate / fromRate;
          }
          rateLocked = rates.fetched_at;
        }

        chargeCurrency = presentment_currency.toLowerCase();
        priceSource = allHaveOverrides ? "override" : anyHasOverride ? "mixed" : "auto";
      }
      // If rates unavailable/stale and not all overridden, fall through to base currency (safe default)
    }

    // Resolve VAT settings: event-level overrides take priority over org-level.
    // event.vat_registered === true  → use event fields (skip org lookup)
    // event.vat_registered === false → no VAT at all (skip org lookup)
    // event.vat_registered == null   → fall back to org-level settings
    let vatAmount = 0;
    let vatRate = 0;
    let vatInclusive = true;

    if (event.vat_registered === true) {
      // Per-event VAT override: enabled
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
        const breakdown = calculateCheckoutVat(afterDiscount, vat);
        if (breakdown) {
          vatAmount = breakdown.vat;
        }
      }
    } else if (event.vat_registered == null) {
      // No per-event override — fall back to org-level settings
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
          const breakdown = calculateCheckoutVat(afterDiscount, vat);
          if (breakdown) {
            vatAmount = breakdown.vat;
          }
        }
      }
    }
    // else: event.vat_registered === false → no VAT (vatAmount stays 0)

    // For multi-currency: recalculate VAT on converted amount if applicable
    if (chargeCurrency !== baseCurrency && vatAmount > 0) {
      const { isZeroDecimalCurrency } = await import("@/lib/stripe/config");
      const roundMoney = isZeroDecimalCurrency(chargeCurrency)
        ? (n: number) => Math.round(n)
        : (n: number) => Math.round(n * 100) / 100;
      // VAT rate is a percentage — apply to converted subtotal
      if (vatInclusive) {
        // VAT is already inside the converted price — just recalculate the amount
        vatAmount = roundMoney(convertedSubtotal - convertedSubtotal / (1 + vatRate / 100));
      } else {
        vatAmount = roundMoney(convertedSubtotal * vatRate / 100);
      }
    }

    // VAT-exclusive: add VAT on top. VAT-inclusive: total unchanged.
    const chargeAmount = vatInclusive ? convertedSubtotal : convertedSubtotal + vatAmount;
    const amountInSmallestUnit = toSmallestUnit(chargeAmount, chargeCurrency);
    const currency = chargeCurrency;

    // Guard: Stripe requires a minimum charge amount (typically 50 cents / 30p)
    if (amountInSmallestUnit <= 0) {
      return NextResponse.json(
        { error: "Order total is too low to process." },
        { status: 400 }
      );
    }

    // Build PaymentIntent parameters — fee rates determined by org's plan
    const plan = await getOrgPlan(orgId);
    const orgBaseCurrency = await getOrgBaseCurrency(orgId);
    const currencyOverride = CURRENCY_FEE_OVERRIDES[currency.toLowerCase()];
    let effectiveFeePercent: number;
    let effectiveMinFee: number;
    if (currencyOverride) {
      // Flat fee override for this currency (e.g. JPY 5%)
      effectiveFeePercent = currencyOverride.fee_percent;
      effectiveMinFee = currencyOverride.min_fee;
    } else {
      effectiveFeePercent = plan.fee_percent;
      effectiveMinFee = plan.min_fee;
      // Cross-currency surcharge: event charges in different currency than org's base
      if (baseCurrency.toUpperCase() !== orgBaseCurrency.toUpperCase()) {
        effectiveFeePercent += CROSS_CURRENCY_SURCHARGE_PERCENT;
      }
    }
    const applicationFee = calculateApplicationFee(amountInSmallestUnit, effectiveFeePercent, effectiveMinFee);

    // Build line items description
    const description = items
      .map((item: { ticket_type_id: string; qty: number }) => {
        const tt = ttMap.get(item.ticket_type_id);
        return `${item.qty}x ${tt?.name || "Ticket"}`;
      })
      .join(", ");

    // Store order details in metadata for webhook to use.
    // IMPORTANT: Stripe limits each metadata value to 500 characters.
    // Strip items down to only the fields needed by confirm-order / webhook
    // (ticket_type_id, qty, merch_size) — omit name, price, image, etc.
    const minimalItems = (items as { ticket_type_id: string; qty: number; merch_size?: string }[]).map((item) => {
      const entry: { t: string; q: number; s?: string } = { t: item.ticket_type_id, q: item.qty };
      if (item.merch_size) entry.s = item.merch_size;
      return entry;
    });
    const itemsJsonValue = JSON.stringify(minimalItems);

    const metadata: Record<string, string> = {
      event_id,
      event_slug: event.slug,
      org_id: orgId,
      customer_email: customer.email.toLowerCase(),
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone || "",
      items_json: itemsJsonValue,
    };

    if (typeof customer.marketing_consent === "boolean") {
      metadata.customer_marketing_consent = customer.marketing_consent ? "true" : "false";
    }

    if (test_order) {
      metadata.test_order = "true";
    }

    // Multi-currency metadata (for order creation)
    if (priceSource !== "auto") {
      metadata.price_source = priceSource;
    }
    if (chargeCurrency !== baseCurrency) {
      metadata.presentment_currency = chargeCurrency.toUpperCase();
      metadata.base_currency = baseCurrency.toUpperCase();
      if (exchangeRate) metadata.exchange_rate = String(exchangeRate);
      metadata.base_subtotal = String(afterDiscount);
      metadata.base_total = String(vatInclusive ? afterDiscount : afterDiscount + vatAmount);
      if (rateLocked) metadata.rate_locked_at = rateLocked;
    }

    if (currencyOverride) {
      metadata.currency_fee_override = String(currencyOverride.fee_percent);
    } else if (baseCurrency.toUpperCase() !== orgBaseCurrency.toUpperCase()) {
      metadata.cross_currency_surcharge = String(CROSS_CURRENCY_SURCHARGE_PERCENT);
    }

    if (discountMeta) {
      metadata.discount_code = discountMeta.code;
      metadata.discount_type = discountMeta.type;
      metadata.discount_value = String(discountMeta.value);
      metadata.discount_amount = String(discountMeta.amount);
    }

    if (vatAmount > 0) {
      metadata.vat_amount = String(vatAmount);
      metadata.vat_rate = String(vatRate);
      metadata.vat_inclusive = vatInclusive ? "true" : "false";
    }

    // Deterministic idempotency key so retries (network timeout, browser refresh)
    // reuse the same PaymentIntent instead of creating duplicates.
    // Key is derived from: org, event, customer email, sorted cart items, discount, and currency.
    const cartFingerprint = JSON.stringify({
      items: (items as { ticket_type_id: string; qty: number; merch_size?: string }[])
        .map((i) => {
          const entry: { id: string; qty: number; s?: string } = { id: i.ticket_type_id, qty: i.qty };
          if (i.merch_size) entry.s = i.merch_size;
          return entry;
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
      email: customer.email.toLowerCase(),
      eventId: event_id,
      discount: discount_code || "",
      currency: chargeCurrency,
    });
    const idempotencyKey = `pi_${orgId}_${createHash("sha256").update(cartFingerprint).digest("hex")}`;

    // Helper to create the PI (shared between connected + platform paths).
    // On idempotency mismatch (same cart but metadata changed — e.g. different
    // phone, fee update, VAT change), retry once with a unique key so checkout
    // isn't blocked. The stale PI expires naturally on Stripe after 24h.
    const createPI = async (key: string): Promise<Awaited<ReturnType<typeof stripe.paymentIntents.create>> | null> => {
      try {
        if (stripeAccountId) {
          return await stripe.paymentIntents.create(
            {
              amount: amountInSmallestUnit,
              currency,
              application_fee_amount: applicationFee,
              description: `${event.name} — ${description}`,
              metadata,
              automatic_payment_methods: { enabled: true },
            },
            { stripeAccount: stripeAccountId, idempotencyKey: key }
          );
        }
        return await stripe.paymentIntents.create({
          amount: amountInSmallestUnit,
          currency,
          description: `${event.name} — ${description}`,
          metadata,
          automatic_payment_methods: { enabled: true },
        }, { idempotencyKey: key });
      } catch (piErr) {
        // Only swallow genuine currency-related errors when doing cross-currency.
        // Everything else (IdempotencyError, AuthenticationError, etc.) must propagate
        // to the outer catch so it gets logged to Sentry + payment_events + alerts.
        const isCurrencyError =
          chargeCurrency !== baseCurrency &&
          piErr instanceof Error &&
          piErr.message.toLowerCase().includes("currency");
        if (isCurrencyError) {
          return null;
        }
        throw piErr;
      }
    };

    // Confirmable PI states — anything else means the PI is dead/used
    const CONFIRMABLE_STATES = new Set([
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
    ]);

    let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>> | null;
    try {
      paymentIntent = await createPI(idempotencyKey);
    } catch (err) {
      // Idempotency mismatch: same cart identity but PI parameters changed
      // (customer details, fees, VAT, etc.). Retry with a unique key.
      if (err instanceof Error && err.message.toLowerCase().includes("idempotent")) {
        const fallbackKey = `${idempotencyKey}_${Date.now()}`;
        paymentIntent = await createPI(fallbackKey);
      } else {
        throw err;
      }
    }

    // Stripe's idempotent response returns the ORIGINAL creation status, not the
    // PI's current state. A PI that was created as requires_payment_method but has
    // since been confirmed (succeeded) will still show requires_payment_method in
    // the idempotent response. We must retrieve the actual current status.
    if (paymentIntent) {
      const retrieveOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;
      const currentPI = await stripe.paymentIntents.retrieve(paymentIntent.id, retrieveOpts);
      if (!CONFIRMABLE_STATES.has(currentPI.status)) {
        // PI is dead (succeeded, cancelled, etc.) — create a fresh one
        const freshKey = `${idempotencyKey}_${Date.now()}`;
        paymentIntent = await createPI(freshKey);
      }
    }

    if (!paymentIntent) {
      return NextResponse.json({
        currency_fallback: true,
        currency: baseCurrency,
      });
    }

    // Increment discount used_count (fire-and-forget — never blocks the payment)
    if (discountMeta) {
      incrementDiscountUsed(supabase, discountMeta.code, orgId);
    }

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_account_id: stripeAccountId || null,
      amount: amountInSmallestUnit,
      currency,
      application_fee: stripeAccountId ? applicationFee : 0,
      discount: discountMeta,
      vat: vatAmount > 0 ? { amount: vatAmount, rate: vatRate, inclusive: vatInclusive } : null,
      // Multi-currency info for the client
      ...(chargeCurrency !== baseCurrency ? {
        presentment_currency: chargeCurrency.toUpperCase(),
        base_currency: baseCurrency.toUpperCase(),
        ...(exchangeRate ? { exchange_rate: exchangeRate } : {}),
        price_source: priceSource,
      } : {}),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("PaymentIntent creation error:", err);
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

/**
 * Fire-and-forget atomic increment of discount used_count.
 * Uses the `increment_discount_used` Postgres RPC so the UPDATE is a single
 * atomic `SET used_count = used_count + 1` — no read-then-write race condition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function incrementDiscountUsed(supabase: any, code: string, orgId: string) {
  supabase
    .rpc("increment_discount_used", { p_code: code, p_org_id: orgId })
    .then(() => {})
    .catch(() => {});
}
