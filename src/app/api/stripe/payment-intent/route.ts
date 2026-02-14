import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  calculateApplicationFee,
  toSmallestUnit,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from "@/lib/stripe/config";
import { createRateLimiter } from "@/lib/rate-limit";

// 10 payment intents per minute per IP — prevents abuse / cost attacks
const paymentLimiter = createRateLimiter("payment-intent", {
  limit: 10,
  windowSeconds: 60,
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

    const stripe = getStripe();
    const body = await request.json();
    const { event_id, items, customer, discount_code } = body;

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

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch event (include stripe_account_id and platform_fee_percent for per-event Connect)
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, payment_method, currency, stripe_account_id, platform_fee_percent")
      .eq("id", event_id)
      .eq("org_id", ORG_ID)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
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

    // Verify ticket types and calculate total
    const ticketTypeIds = items.map(
      (item: { ticket_type_id: string }) => item.ticket_type_id
    );
    const { data: ticketTypes, error: ttErr } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("*")
      .eq("org_id", ORG_ID)
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
        return NextResponse.json(
          {
            error: `Not enough tickets available for "${tt.name}". Available: ${tt.capacity - tt.sold}`,
          },
          { status: 400 }
        );
      }
      subtotal += Number(tt.price) * item.qty;
    }

    // Validate and apply discount code if provided
    let discountAmount = 0;
    let discountMeta: { code: string; type: string; value: number; amount: number } | null = null;

    if (discount_code && typeof discount_code === "string" && discount_code.trim()) {
      const { data: discount } = await supabase
        .from(TABLES.DISCOUNTS)
        .select("*")
        .eq("org_id", ORG_ID)
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
        return NextResponse.json(
          { error: `Minimum order of £${Number(discount.min_order_amount).toFixed(2)} required` },
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

    const chargeAmount = Math.max(subtotal - discountAmount, 0);
    const amountInSmallestUnit = toSmallestUnit(chargeAmount);
    const currency = (event.currency || "GBP").toLowerCase();

    // Build PaymentIntent parameters — use event-level fee override if set, else global default
    const feePercent = event.platform_fee_percent ?? DEFAULT_PLATFORM_FEE_PERCENT;
    const applicationFee = calculateApplicationFee(amountInSmallestUnit, feePercent);

    // Build line items description
    const description = items
      .map((item: { ticket_type_id: string; qty: number }) => {
        const tt = ttMap.get(item.ticket_type_id);
        return `${item.qty}x ${tt?.name || "Ticket"}`;
      })
      .join(", ");

    // Store order details in metadata for webhook to use
    const metadata: Record<string, string> = {
      event_id,
      event_slug: event.slug,
      org_id: ORG_ID,
      customer_email: customer.email.toLowerCase(),
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone || "",
      items_json: JSON.stringify(items),
    };

    if (discountMeta) {
      metadata.discount_code = discountMeta.code;
      metadata.discount_type = discountMeta.type;
      metadata.discount_value = String(discountMeta.value);
      metadata.discount_amount = String(discountMeta.amount);
    }

    if (stripeAccountId) {
      // Direct charge on connected account
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInSmallestUnit,
          currency,
          application_fee_amount: applicationFee,
          description: `${event.name} — ${description}`,
          metadata,
          automatic_payment_methods: {
            enabled: true,
          },
          receipt_email: customer.email.toLowerCase(),
        },
        {
          stripeAccount: stripeAccountId,
        }
      );

      // Increment discount used_count (fire-and-forget — never blocks the payment)
      if (discountMeta) {
        incrementDiscountUsed(supabase, discountMeta.code);
      }

      return NextResponse.json({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        stripe_account_id: stripeAccountId,
        amount: amountInSmallestUnit,
        currency,
        application_fee: applicationFee,
        discount: discountMeta,
      });
    }

    // Platform-only charge (no Connect — for testing or platform-as-seller)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency,
      description: `${event.name} — ${description}`,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: customer.email.toLowerCase(),
    });

    // Increment discount used_count (fire-and-forget)
    if (discountMeta) {
      incrementDiscountUsed(supabase, discountMeta.code);
    }

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_account_id: null,
      amount: amountInSmallestUnit,
      currency,
      application_fee: 0,
      discount: discountMeta,
    });
  } catch (err) {
    console.error("PaymentIntent creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fire-and-forget increment of discount used_count.
 * Uses a simple read-then-write; acceptable for discount tracking
 * (the hard enforcement happens at validation time).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function incrementDiscountUsed(supabase: any, code: string) {
  supabase
    .from(TABLES.DISCOUNTS)
    .select("id, used_count")
    .eq("org_id", ORG_ID)
    .ilike("code", code)
    .single()
    .then(({ data }: { data: { id: string; used_count: number } | null }) => {
      if (data) {
        supabase
          .from(TABLES.DISCOUNTS)
          .update({
            used_count: (data.used_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id)
          .then(() => {});
      }
    })
    .catch(() => {});
}
