import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/auth/change-password — rep-authenticated password change.
 *
 * Body: { current_password, new_password }
 *
 * Verifies current_password by signing the rep in with a fresh, isolated
 * Supabase client (so the verification call doesn't touch the rep's
 * existing session/refresh-token state). On success, updates via the
 * admin SDK keyed on the rep's auth_user_id.
 *
 * iOS Settings → Change Password is the consumer. Logging out and back in
 * with the new password is iOS' job; this endpoint only mutates the
 * stored credential.
 *
 * Security:
 * - Bearer token required (rep auth).
 * - Rate-limited 5/hour/IP — brute force ceiling, not user friction.
 * - new_password ≥ 8 chars, must differ from current.
 * - Auth verification happens against a NEW Supabase client built from
 *   anon key, so a successful verify doesn't mint a session that lingers.
 */

const NEW_PASSWORD_MIN = 8;

const limiter = createRateLimiter("change-password", {
  limit: 5,
  windowSeconds: 3600,
});

export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    if (!auth.rep.auth_user_id) {
      return NextResponse.json(
        { error: "This account has no password to change" },
        { status: 400 },
      );
    }
    if (!auth.rep.email) {
      return NextResponse.json(
        { error: "Account email missing" },
        { status: 400 },
      );
    }

    let body: { current_password?: unknown; new_password?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const currentPassword =
      typeof body.current_password === "string" ? body.current_password : "";
    const newPassword =
      typeof body.new_password === "string" ? body.new_password : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "current_password and new_password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < NEW_PASSWORD_MIN) {
      return NextResponse.json(
        { error: `new_password must be at least ${NEW_PASSWORD_MIN} characters` },
        { status: 400 },
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "new_password must be different from current_password" },
        { status: 400 },
      );
    }

    // Verify current password against an isolated Supabase client. We
    // intentionally do NOT use getSupabaseServer() — that helper is
    // cookie-bound and a successful sign-in would mutate the request's
    // session cookies. We just want a yes/no on the credential.
    const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: auth.rep.email,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 },
      );
    }

    // Update via admin SDK keyed on auth_user_id. This invalidates
    // existing refresh tokens server-side; iOS must re-login.
    const adminDb = await getSupabaseAdmin();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    const { error: updateError } = await adminDb.auth.admin.updateUserById(
      auth.rep.auth_user_id,
      { password: newPassword },
    );

    if (updateError) {
      Sentry.captureException(updateError, {
        extra: { repId: auth.rep.id },
      });
      return NextResponse.json(
        { error: "Failed to update password" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        changed: true,
        // iOS should immediately re-auth (the access token in the
        // current request is technically still valid until expiry, but
        // the refresh token chain is now invalid).
        re_auth_required: true,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[auth/change-password] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
