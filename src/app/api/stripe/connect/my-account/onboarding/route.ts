import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

// Returns auth-scoped client_secret / account-link URL — must never be cached.
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
 * Resolve the tenant's connected account ID from site_settings.
 */
async function getAccountIdForOrg(
  orgId: string
): Promise<string | null> {
  const db = await getSupabaseAdmin();
  if (!db) return null;

  const { data } = await db
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", stripeAccountKey(orgId))
    .single();

  return data?.data?.account_id || null;
}

/**
 * POST /api/stripe/connect/my-account/onboarding
 *
 * Creates an Account Session for embedded ConnectJS onboarding.
 * Returns a client_secret the frontend uses with @stripe/connect-js.
 */
export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const accountId = await getAccountIdForOrg(auth.orgId);
    if (!accountId) {
      return noStoreJson(
        { error: "No connected account found. Please create one first." },
        { status: 404 }
      );
    }

    const stripe = getStripe();

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
      },
    });

    return noStoreJson({
      client_secret: accountSession.client_secret,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account/onboarding] Account session error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create onboarding session";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect/my-account/onboarding
 *
 * Creates an Account Link (hosted onboarding fallback).
 * Used if embedded ConnectJS can't load, or as a direct link option.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const accountId = await getAccountIdForOrg(auth.orgId);
    if (!accountId) {
      return noStoreJson(
        { error: "No connected account found. Please create one first." },
        { status: 404 }
      );
    }

    const stripe = getStripe();
    const origin = request.nextUrl.origin;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin/payments?refresh=true`,
      return_url: `${origin}/admin/payments?onboarding=complete`,
      type: "account_onboarding",
    });

    return noStoreJson({ url: accountLink.url });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account/onboarding] Account link error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create onboarding link";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
