import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/server";
import {
  getOrCreateEpCustomer,
  getSavedCard,
  detachSavedCard,
  savePaymentMethodFromSetupIntent,
  savePaymentMethodFromPaymentIntent,
} from "@/lib/ep/billing";
import * as Sentry from "@sentry/nextjs";

/**
 * GET  /api/admin/ep/payment-method  — returns the saved card details or null
 * POST /api/admin/ep/payment-method  — starts a SetupIntent for saving a card
 * PUT  /api/admin/ep/payment-method  — confirm: persist card after Stripe success
 * DEL  /api/admin/ep/payment-method  — remove saved card
 *
 * Card details returned are display-only — brand, last4, expiry. The raw
 * Stripe PaymentMethod ID never leaves the server.
 */

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const card = await getSavedCard(auth.orgId);
    return NextResponse.json({ data: card });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const customerId = await getOrCreateEpCustomer(
      auth.orgId,
      auth.user?.email ?? null
    );
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        tenant_org_id: auth.orgId,
        purpose: "ep_billing",
      },
    });
    return NextResponse.json({
      data: {
        client_secret: setupIntent.client_secret,
        setup_intent_id: setupIntent.id,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Confirm a card save after Stripe succeeds on the client. Accepts either:
 *   { setup_intent_id }      — explicit "Save a card" flow (SetupIntent)
 *   { payment_intent_id }    — first Buy EP path, where setup_future_usage
 *                              auto-attached the card to the Customer. We
 *                              retrieve the PI to find the PaymentMethod ID.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    let body: { setup_intent_id?: unknown; payment_intent_id?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const sid = typeof body.setup_intent_id === "string" ? body.setup_intent_id : null;
    const pid = typeof body.payment_intent_id === "string" ? body.payment_intent_id : null;
    if (!sid && !pid) {
      return NextResponse.json(
        { error: "setup_intent_id or payment_intent_id is required" },
        { status: 400 }
      );
    }
    const card = sid
      ? await savePaymentMethodFromSetupIntent(auth.orgId, sid)
      : await savePaymentMethodFromPaymentIntent(auth.orgId, pid!);
    if (!card) {
      return NextResponse.json(
        { error: "Intent not succeeded or has no PaymentMethod" },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: card });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    await detachSavedCard(auth.orgId);
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
