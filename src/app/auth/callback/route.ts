import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";
import { slugify, validateSlug, provisionOrg } from "@/lib/signup";

/**
 * GET /auth/callback
 *
 * OAuth callback handler for Google sign-in.
 * 1. Exchanges the auth code for a session (sets cookies)
 * 2. Security gate: verifies user exists in org_users (active or invited)
 * 3. Auto-activates invited users (links auth_user_id, clears invite token)
 * 4. Tags is_admin in app_metadata
 * 5. Redirects to admin dashboard (or login with error)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/admin/";
  const oauthError = searchParams.get("error");
  const oauthErrorDesc = searchParams.get("error_description");

  // Handle OAuth denial or error from provider
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError;
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent(msg)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("No authorization code received")}`
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Authentication service unavailable")}`
    );
  }

  // Create a Supabase client that can set cookies on the response
  const response = NextResponse.redirect(`${origin}${next}`);

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

  // Exchange the code for a session
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[auth/callback] Code exchange failed:", exchangeError.message);
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Sign in failed. Please try again.")}`
    );
  }

  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Could not retrieve your account details.")}`
    );
  }

  // ── Security gate: check org_users ──
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("[auth/callback] SUPABASE_SERVICE_ROLE_KEY not configured");
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("Authentication service misconfigured.")}`
    );
  }

  const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
  const isSignupFlow = searchParams.get("signup") === "1";

  // Find user in org_users by email (case-insensitive), active or invited
  const { data: orgUser, error: orgError } = await adminClient
    .from(TABLES.ORG_USERS)
    .select("id, org_id, email, status, auth_user_id, invite_token")
    .ilike("email", user.email)
    .in("status", ["active", "invited"])
    .limit(1)
    .single();

  if (orgError || !orgUser) {
    // ── Signup flow: provision a new org for this Google user ──
    if (isSignupFlow) {
      const orgNameCookie = request.cookies.get("entry_signup_org")?.value;
      const orgName = orgNameCookie ? decodeURIComponent(orgNameCookie) : null;

      if (!orgName || orgName.trim().length < 2) {
        // No org name cookie — redirect back to signup with error
        await supabase.auth.signOut();
        const errorResponse = NextResponse.redirect(
          `${origin}/admin/signup/?error=${encodeURIComponent("Organization name was lost during sign-in. Please try again.")}`
        );
        request.cookies.getAll().forEach((cookie) => {
          if (cookie.name.startsWith("sb-")) {
            errorResponse.cookies.delete(cookie.name);
          }
        });
        return errorResponse;
      }

      try {
        // Slugify and find available slug
        let slug = slugify(orgName.trim());
        if (slug.length < 3) slug = "my-org";

        const validation = await validateSlug(slug);
        if (!validation.available) {
          for (let i = 2; i <= 99; i++) {
            const candidate = `${slug}-${i}`;
            const check = await validateSlug(candidate);
            if (check.available) {
              slug = candidate;
              break;
            }
          }
        }

        // Provision the org
        await provisionOrg({
          authUserId: user.id,
          email: user.email,
          orgSlug: slug,
          orgName: orgName.trim(),
          firstName: user.user_metadata?.full_name?.split(" ")[0] || undefined,
          lastName: user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || undefined,
        });

        // Tag is_admin in app_metadata
        await adminClient.auth.admin.updateUserById(user.id, {
          app_metadata: { is_admin: true },
        });

        // Clear the signup cookie and redirect to dashboard with welcome
        const signupResponse = NextResponse.redirect(`${origin}/admin/?welcome=1`);
        // Copy session cookies
        response.cookies.getAll().forEach((cookie) => {
          signupResponse.cookies.set(cookie.name, cookie.value, {
            path: "/",
            sameSite: "lax" as const,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30,
          });
        });
        signupResponse.cookies.delete("entry_signup_org");
        return signupResponse;
      } catch (err) {
        console.error("[auth/callback] Signup provisioning failed:", err);
        await supabase.auth.signOut();
        const errorResponse = NextResponse.redirect(
          `${origin}/admin/signup/?error=${encodeURIComponent("Failed to create your organization. Please try again.")}`
        );
        request.cookies.getAll().forEach((cookie) => {
          if (cookie.name.startsWith("sb-")) {
            errorResponse.cookies.delete(cookie.name);
          }
        });
        return errorResponse;
      }
    }

    // Not in org_users and not a signup — sign out and redirect with error
    await supabase.auth.signOut();
    // Clear session cookies on the redirect response
    const errorResponse = NextResponse.redirect(
      `${origin}/admin/login/?error=${encodeURIComponent("You haven't been invited to any organization. Ask your team admin to send you an invite.")}`
    );
    // Delete auth cookies
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        errorResponse.cookies.delete(cookie.name);
      }
    });
    return errorResponse;
  }

  // ── Auto-activate invited users ──
  if (orgUser.status === "invited") {
    const { error: activateError } = await adminClient
      .from(TABLES.ORG_USERS)
      .update({
        auth_user_id: user.id,
        status: "active",
        invite_token: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgUser.id);

    if (activateError) {
      console.error("[auth/callback] Failed to activate invited user:", activateError);
    }
  } else if (!orgUser.auth_user_id) {
    // Active user but no auth_user_id linked — link it
    const { error: linkError } = await adminClient
      .from(TABLES.ORG_USERS)
      .update({
        auth_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgUser.id);

    if (linkError) {
      console.error("[auth/callback] Failed to link auth_user_id:", linkError);
    }
  }

  // ── Tag is_admin in app_metadata (with retry) ──
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: { is_admin: true },
      });
      break;
    } catch (err) {
      if (attempt === 2) {
        console.error("[auth/callback] Failed to tag admin metadata after 2 attempts:", err);
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  return response;
}
