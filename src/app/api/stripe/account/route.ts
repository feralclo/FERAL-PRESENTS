import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";

/**
 * GET /api/stripe/account
 *
 * Returns the connected Stripe account ID (if any) for Express Checkout.
 * Used by client components to load Stripe.js with the correct account context
 * before creating a PaymentIntent (deferred intent flow).
 *
 * Skips live Stripe verification here for speed — the account is fully
 * validated in POST /api/stripe/payment-intent before any charge is created,
 * so a stale ID is caught before money moves.
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

    const accountId =
      (data?.data as { account_id?: string })?.account_id || null;

    return NextResponse.json({ stripe_account_id: accountId });
  } catch {
    return NextResponse.json({ stripe_account_id: null });
  }
}
