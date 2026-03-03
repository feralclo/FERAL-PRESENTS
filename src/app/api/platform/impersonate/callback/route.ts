import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";

/**
 * GET /api/platform/impersonate/callback?token_hash=xxx
 *
 * Public endpoint (no auth required — opened in incognito).
 * Verifies the one-time magic link token, establishes a session,
 * tags is_admin in app_metadata, and redirects to /admin/.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");

  if (!tokenHash) {
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Invalid impersonation link")}`
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Authentication service unavailable")}`
    );
  }

  // Create a Supabase client that can set cookies on the redirect response
  const response = NextResponse.redirect(`${origin}/admin/`);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            path: "/",
            sameSite: "lax" as const,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30, // 30 days
            ...options,
          });
        });
      },
    },
  });

  // Verify the magic link token — this creates a session and sets cookies
  const { data, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (verifyErr || !data.user) {
    console.error("[impersonate/callback] OTP verification failed:", verifyErr?.message);
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Login link expired or already used. Generate a new one.")}`
    );
  }

  // Tag is_admin in app_metadata so requireAuth() and middleware work
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

    // Verify user is in org_users (safety check)
    const { data: orgUser } = await adminClient
      .from(TABLES.ORG_USERS)
      .select("id")
      .eq("auth_user_id", data.user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!orgUser) {
      // Not in org_users — sign out and redirect with error
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${origin}/admin/login/?error=${encodeURIComponent("User not found in any organization")}`
      );
    }

    await adminClient.auth.admin.updateUserById(data.user.id, {
      app_metadata: { is_admin: true },
    });
  }

  return response;
}
