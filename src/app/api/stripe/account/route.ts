import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { verifyConnectedAccount } from "@/lib/stripe/server";

/**
 * GET /api/stripe/account
 *
 * Returns the connected Stripe account ID (if any) for Express Checkout.
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
      return NextResponse.json({ stripe_account_id: null });
    }

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(orgId))
      .single();

    const rawAccountId =
      (data?.data as { account_id?: string })?.account_id || null;

    const accountId = await verifyConnectedAccount(rawAccountId);

    return NextResponse.json({ stripe_account_id: accountId });
  } catch {
    return NextResponse.json({ stripe_account_id: null });
  }
}
