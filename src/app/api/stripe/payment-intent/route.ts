import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  calculateApplicationFee,
  toSmallestUnit,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from "@/lib/stripe/config";

/**
 * POST /api/stripe/payment-intent
 *
 * Creates a Stripe PaymentIntent for a ticket purchase.
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
    const stripe = getStripe();
    const body = await request.json();
    const { event_id, items, customer } = body;

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

    const amountInSmallestUnit = toSmallestUnit(subtotal);
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
    const metadata = {
      event_id,
      event_slug: event.slug,
      org_id: ORG_ID,
      customer_email: customer.email.toLowerCase(),
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone || "",
      items_json: JSON.stringify(items),
    };

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

      return NextResponse.json({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        stripe_account_id: stripeAccountId,
        amount: amountInSmallestUnit,
        currency,
        application_fee: applicationFee,
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

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_account_id: null,
      amount: amountInSmallestUnit,
      currency,
      application_fee: 0,
    });
  } catch (err) {
    console.error("PaymentIntent creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
