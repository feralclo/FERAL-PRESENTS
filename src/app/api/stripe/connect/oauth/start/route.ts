import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey, generalKey } from "@/lib/constants";
import { buildAuthorizeUrl, isOAuthConfigured, signOAuthState } from "@/lib/stripe/oauth";
import * as Sentry from "@sentry/nextjs";

// Issues an org-scoped, single-use signed state token in the URL — must never
// be cached, or one tenant's authorize-URL would leak to another.
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
 * POST /api/stripe/connect/oauth/start
 *
 * Generates a one-time, HMAC-signed Stripe Connect OAuth URL for the tenant
 * to link their existing Stripe account (Standard). The state token binds
 * the round-trip to this org so the callback can't attach an account to a
 * different org if the user is signed in elsewhere.
 *
 * Returns 503 when STRIPE_CONNECT_CLIENT_ID isn't set so the UI can hide the
 * "Connect existing Stripe" path gracefully on environments where OAuth
 * hasn't been enabled in the platform's Stripe dashboard yet.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    if (!isOAuthConfigured()) {
      return noStoreJson(
        { error: "Stripe OAuth is not configured on this platform." },
        { status: 503 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return noStoreJson({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: existing } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    if (existing?.data?.account_id) {
      return noStoreJson(
        {
          error: "This org is already connected to a Stripe account.",
          account_id: existing.data.account_id,
        },
        { status: 409 }
      );
    }

    const { data: general } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", generalKey(auth.orgId))
      .single();

    const state = signOAuthState(auth.orgId);
    const origin = request.nextUrl.origin;
    const url = buildAuthorizeUrl({
      state,
      redirectUri: `${origin}/api/stripe/connect/oauth/callback`,
      email: auth.user.email || null,
      businessName: general?.data?.org_name || null,
      country: general?.data?.country || null,
    });

    return noStoreJson({ url });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[stripe/connect/oauth/start] error:", err);
    const message = err instanceof Error ? err.message : "Failed to start OAuth";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
