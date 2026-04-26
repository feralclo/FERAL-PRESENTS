import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { verifyConnectedAccount, getAccountCapabilities } from "@/lib/stripe/server";
import * as Sentry from "@sentry/nextjs";

// Returns the org's connected Stripe account ID — auth-scoped via x-org-id
// from middleware. Vercel Data Cache must not key by URL alone or it will
// serve one tenant's account ID to another. See commit 9da97ba / e54e284.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
} as const;

function noStoreJson(data: unknown, init?: ResponseInit): NextResponse {
  return noStoreJson(data, {
    ...init,
    headers: { ...(init?.headers || {}), ...NO_STORE_HEADERS },
  });
}

/**
 * GET /api/stripe/account
 *
 * Returns the connected Stripe account ID (if any) for Express Checkout,
 * plus active payment capabilities (e.g. paypay_payments).
 * Used by client components to load Stripe.js with the correct account context
 * before creating a PaymentIntent (deferred intent flow).
 *
 * The account is verified via stripe.accounts.retrieve() to prevent returning
 * a stale/revoked ID that would break Stripe.js initialization (Apple Pay,
 * Google Pay would silently fail). Results are cached in-memory for 5 min
 * so the Stripe API call only happens once per server instance, not per request.
 */
export async function GET() {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return noStoreJson({ stripe_account_id: null, capabilities: {} });
    }

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(orgId))
      .single();

    const rawAccountId =
      (data?.data as { account_id?: string })?.account_id || null;

    const accountId = await verifyConnectedAccount(rawAccountId);
    const capabilities = getAccountCapabilities(accountId);

    return noStoreJson({ stripe_account_id: accountId, capabilities });
  } catch (err) {
    Sentry.captureException(err);
    return noStoreJson({ stripe_account_id: null, capabilities: {} });
  }
}
