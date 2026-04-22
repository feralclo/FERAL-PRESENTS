import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

// 30 refreshes per 15 minutes per IP — generous because a device may legitimately
// refresh on every cold start; tighter than mobile-login because a stolen refresh
// token is dangerous.
const refreshLimiter = createRateLimiter("auth-mobile-refresh", {
  limit: 30,
  windowSeconds: 15 * 60,
});

/**
 * POST /api/auth/mobile-refresh
 *
 * Rotates a refresh token for native clients that store JWTs in Keychain /
 * secure-storage (iOS, Android, web-v2). Accepts a refresh token, returns a
 * fresh access + refresh token pair. The old refresh token is invalidated by
 * Supabase on successful rotation (security property of the Supabase auth
 * service itself).
 *
 * Body: { refresh_token }
 *
 * Response (200): { access_token, refresh_token, expires_at }
 * Response (400): missing or invalid body
 * Response (401): refresh token rejected by Supabase (expired / revoked / forged)
 * Response (429): rate-limited
 * Response (503): Supabase env vars not configured
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = refreshLimiter(request);
    if (blocked) return blocked;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const refreshToken =
      typeof body?.refresh_token === "string" ? body.refresh_token : "";

    if (!refreshToken) {
      return NextResponse.json(
        { error: "refresh_token is required" },
        { status: 400 }
      );
    }

    // Stateless client — no cookies, no persisted session. Every request
    // carries its own refresh token; we never store auth state on the server.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return NextResponse.json(
        { error: "invalid or expired refresh token" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[auth/mobile-refresh] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
