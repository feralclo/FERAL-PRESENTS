import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

/**
 * Returns an HTML page that sets cookies and redirects client-side.
 * Mobile browsers (Safari ITP, WhatsApp in-app) often drop cookies on
 * 302 redirects from API routes. Returning an HTML page that the browser
 * renders ensures cookies are stored in a first-party context before navigating.
 */
function htmlRedirectResponse(
  redirectUrl: string,
  cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
) {
  const response = new NextResponse(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="2;url=${redirectUrl}">
<title>Logging in...</title>
<style>body{background:#08080c;color:#f0f0f5;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{text-align:center}.s{width:20px;height:20px;border:2px solid rgba(139,92,246,0.3);border-top-color:#8B5CF6;border-radius:50%;animation:spin 0.6s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}</style>
</head><body><div class="c"><div class="s"></div><p>Logging you in...</p></div>
<script>setTimeout(function(){window.location.href="${redirectUrl}"},500)</script>
</body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      path: "/",
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      ...options,
    });
  });

  return response;
}

/**
 * GET /api/rep-portal/magic-login/callback?token_hash=xxx
 *
 * Public endpoint — verifies the one-time magic link token,
 * establishes a session, ensures is_rep metadata, and redirects to /rep/.
 *
 * Returns an HTML page (not a 302) so cookies are reliably set on mobile
 * browsers where ITP/in-app browsers drop cookies during redirects.
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

  // Collect cookies from the Supabase client to set on the final response
  const pendingCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

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
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  // Verify the magic link token — creates session + queues cookies
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

  // Return HTML page that sets cookies and redirects client-side
  // (mobile browsers drop cookies on 302 redirects due to ITP)
  return htmlRedirectResponse(`${origin}/rep/`, pendingCookies);
}
