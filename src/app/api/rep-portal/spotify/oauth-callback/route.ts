import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  encryptToken,
  exchangeCodeForTokens,
  fetchSpotifyMe,
  isUserAuthConfigured,
  verifyState,
} from "@/lib/spotify/user-auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/spotify/oauth-callback
 *
 * Public route — the redirect arrives from Spotify's servers in the
 * iOS-mediated ASWebAuthenticationSession, which doesn't share the rep
 * auth cookie. The signed state token IS the proof of rep identity.
 *
 * Flow:
 *   1. Verify state (HMAC + 15-min window) → recover rep_id.
 *   2. Exchange auth code for access + refresh tokens.
 *   3. Fetch /me for display_name + product (premium check).
 *   4. AES-256-GCM encrypt access_token + refresh_token, upsert into
 *      spotify_user_tokens.
 *   5. 302-redirect to entry://spotify-callback?status=success|error
 *
 * iOS captures the entry:// redirect via ASWebAuthenticationSession.
 * No Universal Link config required.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_SCHEME = "entry://spotify-callback";

function appRedirect(params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  const res = NextResponse.redirect(`${APP_SCHEME}?${qs}`);
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const spotifyError = url.searchParams.get("error");
  if (spotifyError) {
    return appRedirect({ status: "error", reason: spotifyError });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return appRedirect({ status: "error", reason: "missing_code" });
  }

  try {
    if (!isUserAuthConfigured()) {
      return appRedirect({ status: "error", reason: "not_configured" });
    }

    const verified = verifyState(state);
    if (!verified.ok) {
      return appRedirect({ status: "error", reason: `state_${verified.reason}` });
    }

    const tokens = await exchangeCodeForTokens(code);
    const me = await fetchSpotifyMe(tokens.access_token);

    const db = await getSupabaseAdmin();
    if (!db) {
      return appRedirect({ status: "error", reason: "service_unavailable" });
    }

    // Confirm the rep still exists + isn't soft-deleted before we upsert.
    // Cheap; protects against a stale state token referencing a wiped rep.
    const { data: rep } = await db
      .from("reps")
      .select("id, status")
      .eq("id", verified.repId)
      .maybeSingle();
    if (!rep || (rep as { status: string }).status === "deleted") {
      return appRedirect({ status: "error", reason: "rep_not_found" });
    }

    if (!tokens.refresh_token) {
      // Spotify only ships a refresh_token on the first authorize. If a
      // rep re-runs the flow without revoking the prior connection, we
      // need to keep the existing refresh_token. Look one up.
      const { data: prior } = await db
        .from("spotify_user_tokens")
        .select("refresh_token")
        .eq("rep_id", verified.repId)
        .maybeSingle();
      if (!prior) {
        return appRedirect({ status: "error", reason: "no_refresh_token" });
      }
      tokens.refresh_token = (prior as { refresh_token: string }).refresh_token;
    } else {
      tokens.refresh_token = encryptToken(tokens.refresh_token);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: upsertError } = await db
      .from("spotify_user_tokens")
      .upsert(
        {
          rep_id: verified.repId,
          spotify_user_id: me.id,
          display_name: me.display_name ?? null,
          is_premium: me.product === "premium",
          access_token: encryptToken(tokens.access_token),
          refresh_token: tokens.refresh_token,
          scope: tokens.scope,
          expires_at: expiresAt,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "rep_id" }
      );

    if (upsertError) {
      Sentry.captureException(upsertError, { extra: { repId: verified.repId } });
      return appRedirect({ status: "error", reason: "db_write_failed" });
    }

    return appRedirect({
      status: "success",
      display_name: me.display_name ?? "",
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/oauth-callback] error:", err);
    return appRedirect({ status: "error", reason: "exchange_failed" });
  }
}
