import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { calculateApplicationFee, getCurrencySymbol } from "@/lib/stripe/config";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/guest-list/application-payment — Create PaymentIntent for paid acceptance
 * Body: { token } (invite_token from the guest_list entry)
 * Public — no auth required (token is the access control)
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    // Find the guest entry
    const { data: guest, error: gErr } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*, event:events(id, name, slug, currency, stripe_account_id)")
      .eq("invite_token", token)
      .single();

    if (gErr || !guest) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (!guest.payment_amount || guest.payment_amount <= 0) {
      return NextResponse.json({ error: "This acceptance is free — no payment needed" }, { status: 400 });
    }
    if (guest.order_id) {
      return NextResponse.json({ error: "Already paid" }, { status: 409 });
    }

    const orgId = guest.org_id as string;
    const event = guest.event as { id: string; name: string; slug?: string; currency?: string; stripe_account_id?: string } | null;
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const currency = (event.currency || "GBP").toLowerCase();
    const amount = guest.payment_amount as number; // already in smallest unit

    // Resolve Stripe account (event-level → org-level → platform)
    let stripeAccountId = event.stripe_account_id || null;
    if (!stripeAccountId) {
      const { data: stripeRow } = await supabase.from(TABLES.SITE_SETTINGS)
        .select("data").eq("key", `${orgId}_stripe_account`).single();
      stripeAccountId = (stripeRow?.data as Record<string, string>)?.account_id || null;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion });

    // Build PaymentIntent
    const piParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency,
      metadata: {
        org_id: orgId,
        guest_list_id: guest.id,
        event_id: event.id,
        event_name: event.name,
        customer_email: guest.email,
        customer_name: guest.name,
        type: "guest_list_application",
      },
      ...(stripeAccountId
        ? { application_fee_amount: calculateApplicationFee(amount) }
        : {}),
    };

    const pi = stripeAccountId
      ? await stripe.paymentIntents.create(piParams, { stripeAccount: stripeAccountId })
      : await stripe.paymentIntents.create(piParams);

    return NextResponse.json({
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      stripe_account_id: stripeAccountId || null,
      amount,
      currency: currency.toUpperCase(),
      currency_symbol: getCurrencySymbol(currency),
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
