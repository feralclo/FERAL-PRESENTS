import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

// Auth-scoped — never cache. Vercel's Data Cache will key by URL alone
// and serve one tenant's recent transactions to another otherwise.
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
 * GET /api/stripe/connect/my-account/activity
 *
 * Recent charges + payouts on the tenant's connected account, for the
 * Settings → Finance dashboard. Returns up to 10 charges and 5 payouts.
 *
 * Both lists are tolerated to fail independently (e.g. card_payments
 * capability not yet active means charges.list 400s but we still want to
 * show payouts) — Promise.allSettled keeps the dashboard rendering with
 * whatever is available rather than crashing the whole tab.
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
      return noStoreJson({ charges: [], payouts: [] });
    }

    const stripe = getStripe();

    const [chargesRes, payoutsRes] = await Promise.allSettled([
      stripe.charges.list({ limit: 10 }, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 5 }, { stripeAccount: accountId }),
    ]);

    const charges =
      chargesRes.status === "fulfilled"
        ? chargesRes.value.data.map((c) => ({
            id: c.id,
            amount: c.amount,
            currency: c.currency,
            status: c.status,
            paid: c.paid,
            refunded: c.refunded,
            created: c.created,
            customer_email:
              c.billing_details?.email || c.receipt_email || null,
            description: c.description || null,
          }))
        : [];

    const payouts =
      payoutsRes.status === "fulfilled"
        ? payoutsRes.value.data.map((p) => ({
            id: p.id,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            arrival_date: p.arrival_date,
            created: p.created,
          }))
        : [];

    return noStoreJson({ charges, payouts });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account/activity] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to load activity";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
