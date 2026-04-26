import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey, generalKey } from "@/lib/constants";
import { getDefaultCurrency } from "@/lib/country-currency-map";
import { isOAuthConfigured, verifyOAuthState } from "@/lib/stripe/oauth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/stripe/connect/oauth/callback
 *
 * Stripe redirects the tenant's browser here after they authorise the OAuth
 * grant in their existing Stripe account. We verify the signed state, exchange
 * the auth code for a connected `stripe_user_id` (a Standard account ID), and
 * persist it in the same `{org_id}_stripe_account` setting the Custom flow
 * uses, so per-event routing in `/api/stripe/payment-intent` keeps working
 * unchanged. We then redirect back to /admin/payments with a status flag.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const back = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return NextResponse.redirect(new URL(`/admin/payments?${qs}`, url.origin));
  };

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    return back({ oauth: "error", reason: errorDescription || error });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return back({ oauth: "error", reason: "Missing code or state" });
  }

  try {
    if (!isOAuthConfigured()) {
      return back({ oauth: "error", reason: "OAuth not configured" });
    }

    const verified = verifyOAuthState(state);
    if (!verified.ok) {
      return back({ oauth: "error", reason: `Invalid state (${verified.reason})` });
    }

    const auth = await requireAuth();
    if (auth.error) {
      return back({ oauth: "error", reason: "Sign in to finish connecting" });
    }
    if (auth.orgId !== verified.orgId) {
      return back({ oauth: "error", reason: "OAuth state belongs to a different org" });
    }

    const stripe = getStripe();
    const tokenResponse = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const accountId = tokenResponse.stripe_user_id;
    if (!accountId) {
      return back({ oauth: "error", reason: "Stripe did not return an account ID" });
    }

    const account = await stripe.accounts.retrieve(accountId);

    const db = await getSupabaseAdmin();
    if (!db) {
      return back({ oauth: "error", reason: "Service unavailable" });
    }

    await db.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: stripeAccountKey(auth.orgId),
        data: {
          account_id: accountId,
          account_type: "standard",
          country: account.country || null,
          livemode: tokenResponse.livemode ?? null,
          scope: tokenResponse.scope || "read_write",
          connected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (account.country) {
      const key = generalKey(auth.orgId);
      const { data: existing } = await db
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", key)
        .single();
      const merged = {
        ...(existing?.data || {}),
        country: account.country,
        base_currency: getDefaultCurrency(account.country),
      };
      await db.from(TABLES.SITE_SETTINGS).upsert(
        { key, data: merged, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }

    return back({ oauth: "success" });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[stripe/connect/oauth/callback] error:", err);
    const message = err instanceof Error ? err.message : "Failed to finish connecting";
    return back({ oauth: "error", reason: message });
  }
}
