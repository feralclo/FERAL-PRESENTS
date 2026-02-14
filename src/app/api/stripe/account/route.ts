import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";
import { verifyConnectedAccount } from "@/lib/stripe/server";

/**
 * GET /api/stripe/account
 *
 * Returns the connected Stripe account ID (if any) for Express Checkout.
 * Used by client components to load Stripe.js with the correct account context
 * before creating a PaymentIntent (deferred intent flow).
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ stripe_account_id: null });
    }

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", "feral_stripe_account")
      .single();

    const rawAccountId =
      (data?.data as { account_id?: string })?.account_id || null;

    // Validate the account is accessible before returning it to the client.
    // A stale/revoked account ID would break Stripe.js initialization.
    const accountId = await verifyConnectedAccount(rawAccountId);

    return NextResponse.json({ stripe_account_id: accountId });
  } catch {
    return NextResponse.json({ stripe_account_id: null });
  }
}
