import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { syncOrgApplePayDomains } from "@/lib/apple-pay";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/stripe/apple-pay-domain
 *
 * Idempotently sync ALL of the calling org's active domains to the right
 * Stripe account (their connected account if configured, platform otherwise).
 * Body is optional — pass nothing for a full sync. Pass `{ domain: "x.com" }`
 * to register just that domain (legacy single-domain mode, kept for
 * backwards compat).
 *
 * Why this changed: the previous version registered whatever
 * window.location.hostname was at call time — which from /admin/payments
 * meant 'admin.entry.events', a domain buyers never visit. Apple Pay
 * therefore never appeared on the tenant's actual selling domains.
 * Bulk sync from the domains table fixes that.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const { domain } = body as { domain?: string };

    // Legacy single-domain mode (kept for callers that still need it).
    if (domain) {
      return await registerSingleDomain(auth.orgId, domain);
    }

    // Bulk sync — recommended path.
    const result = await syncOrgApplePayDomains(auth.orgId);
    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[apple-pay-domain] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to register domain";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function registerSingleDomain(
  orgId: string,
  domain: string,
): Promise<NextResponse> {
  const stripe = getStripe();

  let stripeAccountId: string | null = null;
  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", stripeAccountKey(orgId))
        .single();
      stripeAccountId =
        (data?.data as { account_id?: string })?.account_id || null;
    }
  } catch {
    // No connected account — register on platform
  }

  const applePayDomain = await stripe.applePayDomains.create(
    { domain_name: domain },
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
  );

  return NextResponse.json({
    id: applePayDomain.id,
    domain_name: applePayDomain.domain_name,
    live_mode: applePayDomain.livemode,
    registered_on: stripeAccountId || "platform",
  });
}

/**
 * GET /api/stripe/apple-pay-domain
 *
 * Lists registered Apple Pay domains on the org's Stripe account.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();

    let stripeAccountId: string | null = null;
    try {
      const supabase = await getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", stripeAccountKey(auth.orgId))
          .single();
        stripeAccountId =
          (data?.data as { account_id?: string })?.account_id || null;
      }
    } catch {
      // No connected account
    }

    const domains = await stripe.applePayDomains.list(
      { limit: 100 },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
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
    Sentry.captureException(err);
    console.error("Apple Pay domain list error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to list domains";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
