import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

/**
 * GET /api/rep-portal/magic-login/callback?token_hash=xxx
 *
 * Public endpoint — verifies the one-time magic link token,
 * establishes a session, ensures is_rep metadata, and redirects to /rep/.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");

  if (!tokenHash) {
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Invalid magic login link")}`
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Authentication service unavailable")}`
    );
  }

  // Create a Supabase client that sets cookies on the redirect response
  const response = NextResponse.redirect(`${origin}/rep/`);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[]
      ) {
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

  // Verify the magic link token — creates session + sets cookies
  const { data, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (verifyErr || !data.user) {
    console.error(
      "[rep-magic-login/callback] OTP verification failed:",
      verifyErr?.message
    );
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Login link expired or already used. Generate a new one.")}`
    );
  }

  // Ensure is_rep is set in app_metadata so middleware and requireRepAuth() work
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

    // Verify this user actually has a rep row
    const { data: rep } = await adminClient
      .from("reps")
      .select("id, status")
      .eq("auth_user_id", data.user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!rep) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${origin}/rep/login?error=${encodeURIComponent("No active rep account found for this user")}`
      );
    }

    // Tag is_rep in app_metadata
    await adminClient.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...data.user.app_metadata, is_rep: true },
    });
  }

  return response;
}
