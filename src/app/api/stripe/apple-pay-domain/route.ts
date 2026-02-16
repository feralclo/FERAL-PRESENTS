import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/stripe/apple-pay-domain
 *
 * Registers a domain for Apple Pay with Stripe.
 * For Connect (direct charges), registers on the connected account.
 *
 * Body: { domain: "feralpresents.com" }
 *
 * Prerequisites:
 *   1. The verification file must be accessible at
 *      https://<domain>/.well-known/apple-developer-merchantid-domain-association
 *      (handled by the rewrite in next.config.ts + /api/stripe/apple-pay-verify)
 *   2. The domain must be a real domain (not localhost) in live mode.
 *      In test mode, localhost works.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();
    const body = await request.json();
    const { domain } = body;

    if (!domain) {
      return NextResponse.json(
        { error: "domain is required" },
        { status: 400 }
      );
    }

    // Check for connected account
    let stripeAccountId: string | null = null;
    try {
      const supabase = await getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", "feral_stripe_account")
          .single();
        stripeAccountId =
          (data?.data as { account_id?: string })?.account_id || null;
      }
    } catch {
      // No connected account — register on platform
    }

    // Register domain on connected account (or platform)
    const applePayDomain = await stripe.applePayDomains.create(
      { domain_name: domain },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );

    return NextResponse.json({
      id: applePayDomain.id,
      domain_name: applePayDomain.domain_name,
      live_mode: applePayDomain.livemode,
      registered_on: stripeAccountId || "platform",
    });
  } catch (err) {
    console.error("Apple Pay domain registration error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to register domain";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/apple-pay-domain
 *
 * Lists registered Apple Pay domains.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();

    // Check for connected account
    let stripeAccountId: string | null = null;
    try {
      const supabase = await getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", "feral_stripe_account")
          .single();
        stripeAccountId =
          (data?.data as { account_id?: string })?.account_id || null;
      }
    } catch {
      // No connected account
    }

    const domains = await stripe.applePayDomains.list(
      { limit: 100 },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );

    return NextResponse.json({
      domains: domains.data.map((d) => ({
        id: d.id,
        domain_name: d.domain_name,
        live_mode: d.livemode,
      })),
      registered_on: stripeAccountId || "platform",
    });
  } catch (err) {
    console.error("Apple Pay domain list error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to list domains";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
