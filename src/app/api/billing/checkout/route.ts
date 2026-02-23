import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/server";
import {
  getOrgPlanSettings,
  ensureStripePriceExists,
  updateOrgPlanSettings,
} from "@/lib/plans";

/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for upgrading to Pro plan.
 * Redirects the tenant to Stripe-hosted checkout to enter payment details.
 */
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user, orgId } = auth;

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 }
    );
  }

  const planSettings = await getOrgPlanSettings(orgId);

  // Block if already on Pro with active subscription
  if (
    planSettings?.plan_id === "pro" &&
    planSettings.subscription_status === "active"
  ) {
    return NextResponse.json(
      { error: "Already on Pro plan with active subscription" },
      { status: 400 }
    );
  }

  // Block if billing is waived (platform-managed)
  if (planSettings?.billing_waived) {
    return NextResponse.json(
      { error: "Billing is waived for this organization" },
      { status: 400 }
    );
  }

  // Ensure Stripe Product + Price exist
  const priceId = await ensureStripePriceExists();

  // Create or reuse Stripe Customer
  let customerId = planSettings?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { org_id: orgId, platform: "entry" },
    });
    customerId = customer.id;

    await updateOrgPlanSettings(orgId, {
      stripe_customer_id: customerId,
    });
  }

  // Create Checkout Session
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/admin/settings/plan/?upgraded=1`,
    cancel_url: `${siteUrl}/admin/settings/plan/`,
    metadata: { org_id: orgId },
    subscription_data: {
      metadata: { org_id: orgId },
    },
  });

  return NextResponse.json({ url: session.url });
}
