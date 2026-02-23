import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/server";
import { getOrgPlanSettings } from "@/lib/plans";

/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for managing billing
 * (update card, cancel subscription, view invoices).
 */
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { orgId } = auth;

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

  if (!planSettings?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Upgrade to Pro first." },
      { status: 400 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: planSettings.stripe_customer_id,
    return_url: `${siteUrl}/admin/settings/plan/`,
  });

  return NextResponse.json({ url: session.url });
}
