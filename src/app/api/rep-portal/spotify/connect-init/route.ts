import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { buildAuthorizeUrl, isUserAuthConfigured, signState } from "@/lib/spotify/user-auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/spotify/connect-init
 *
 * Hands iOS the Spotify authorize URL to open inside
 * ASWebAuthenticationSession. Body is empty — auth alone identifies the
 * rep, and the signed state token binds the upcoming round-trip to that
 * specific rep id (15-min window).
 *
 * Returns 503 when SPOTIFY_CLIENT_ID/SECRET aren't configured so the
 * iOS Settings row can hide the Connect affordance gracefully.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, must-revalidate" } as const;

export async function POST(_request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    if (!isUserAuthConfigured()) {
      return NextResponse.json(
        { error: "Spotify connect not configured" },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const state = signState(auth.rep.id);
    const authUrl = buildAuthorizeUrl(state);

    return NextResponse.json({ data: { auth_url: authUrl } }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/connect-init] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
