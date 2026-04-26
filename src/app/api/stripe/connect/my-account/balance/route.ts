import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

// Returns auth-scoped balance figures — must never be cached. The Vercel
// Data Cache will key by URL alone otherwise and serve one tenant's held
// funds to another.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
} as const;

function noStoreJson(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...(init?.headers || {}), ...NO_STORE_HEADERS },
  });
}

/**
 * GET /api/stripe/connect/my-account/balance
 *
 * Returns the Stripe-side balance held inside the tenant's connected account.
 * Used by /admin/payments to surface held funds when charges are enabled but
 * payouts are not yet (Phase 2 of onboarding — bank not added yet).
 *
 * Response shape:
 *   {
 *     available: [{ amount: number, currency: string }],   // settled, ready to pay out
 *     pending:   [{ amount: number, currency: string }],   // not yet settled (rolling reserve)
 *   }
 *
 * Amounts are in Stripe's smallest currency unit (e.g. pence for GBP).
 * Money sits here until the connected account adds an external_account; at
 * that point Stripe begins paying it out on the configured schedule.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return noStoreJson({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: setting } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    const accountId: string | undefined = setting?.data?.account_id;
    if (!accountId) {
      return noStoreJson(
        { error: "No connected account found" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const balance = await stripe.balance.retrieve({ stripeAccount: accountId });

    return noStoreJson({
      available: (balance.available || []).map((b) => ({
        amount: b.amount,
        currency: b.currency,
      })),
      pending: (balance.pending || []).map((b) => ({
        amount: b.amount,
        currency: b.currency,
      })),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account/balance] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to retrieve balance";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
