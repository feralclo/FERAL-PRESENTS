import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { getEpConfig, epToPence } from "@/lib/ep/config";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/admin/ep/purchase-intent
 *
 * Creates a Stripe PaymentIntent on the platform account so a tenant admin
 * can top up their EP float. No VAT applied at purchase (EP is a multi-
 * purpose voucher under UK VAT — VAT applies at redemption, per §7.6).
 *
 * Body:
 *   { ep_amount: int (min 100, max 10_000_000) }
 *
 * Response (200):
 *   {
 *     data: {
 *       client_secret,
 *       payment_intent_id,
 *       ep_amount,
 *       fiat_pence,
 *       fiat_currency,
 *       fiat_rate_pence,
 *       purchase_id
 *     }
 *   }
 *
 * On Stripe webhook payment_intent.succeeded, the handler looks up the
 * ep_tenant_purchases row by stripe_payment_intent_id and writes the
 * tenant_purchase ledger entry atomically.
 */

const MIN_EP = 100; // £1 at default rate
const MAX_EP = 10_000_000; // £100k at default rate — generous upper bound

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    let body: { ep_amount?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const epAmount = Number(body.ep_amount);
    if (!Number.isInteger(epAmount) || epAmount < MIN_EP || epAmount > MAX_EP) {
      return NextResponse.json(
        { error: `ep_amount must be an integer between ${MIN_EP} and ${MAX_EP}` },
        { status: 400 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const config = await getEpConfig();
    const fiatPence = epToPence(epAmount, config.fiat_rate_pence);

    // Create a pending purchase row first so we can surface it in /admin/ep
    // even before Stripe confirms.
    const { data: purchase, error: purchaseErr } = await db
      .from("ep_tenant_purchases")
      .insert({
        tenant_org_id: auth.orgId,
        ep_amount: epAmount,
        fiat_pence: fiatPence,
        fiat_currency: "GBP",
        fiat_rate_pence: config.fiat_rate_pence,
        status: "pending",
      })
      .select("id")
      .single();

    if (purchaseErr || !purchase) {
      Sentry.captureException(purchaseErr ?? new Error("Failed to create ep_tenant_purchases"), {
        extra: { orgId: auth.orgId, epAmount },
      });
      return NextResponse.json(
        { error: "Failed to create purchase" },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: fiatPence,
        currency: "gbp",
        // Let Stripe decide the best payment method (card by default; adds
        // Apple/Google Pay at checkout time). Tenant is topping up a credit,
        // so "setup" intent doesn't apply — straight purchase.
        automatic_payment_methods: { enabled: true },
        description: `Entry EP top-up — ${epAmount} EP`,
        metadata: {
          type: "ep_purchase",
          tenant_org_id: auth.orgId,
          ep_amount: String(epAmount),
          fiat_rate_pence: String(config.fiat_rate_pence),
          purchase_id: purchase.id,
        },
      });
    } catch (stripeErr) {
      // Stripe failed — mark the pending purchase as failed for audit
      await db
        .from("ep_tenant_purchases")
        .update({ status: "failed" })
        .eq("id", purchase.id);
      Sentry.captureException(stripeErr, {
        extra: { orgId: auth.orgId, epAmount, purchaseId: purchase.id },
      });
      return NextResponse.json(
        { error: "Payment provider error" },
        { status: 502 }
      );
    }

    // Bind the PaymentIntent to the purchase row (idempotency key for the
    // webhook handler).
    await db
      .from("ep_tenant_purchases")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", purchase.id);

    return NextResponse.json({
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        ep_amount: epAmount,
        fiat_pence: fiatPence,
        fiat_currency: "GBP",
        fiat_rate_pence: config.fiat_rate_pence,
        purchase_id: purchase.id,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/ep/purchase-intent] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
