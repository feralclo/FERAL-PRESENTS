import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { getRepSettings } from "@/lib/rep-points";
import { sendRepEmail } from "@/lib/rep-emails";
import { ensureRepCustomer } from "@/lib/rep-utils";
import { autoAssignRepToAllEvents } from "@/lib/rep-auto-assign";

/**
 * GET /auth/rep-callback
 *
 * OAuth callback handler for rep Google sign-in.
 * 1. Exchanges the auth code for a session (sets cookies)
 * 2. Looks up existing rep by auth_user_id or email
 * 3. If found: links auth_user_id if needed, tags is_rep, redirects to /rep/
 * 4. If not found: creates a new rep from Google profile, tags is_rep,
 *    creates customer record, redirects to /rep/
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthErrorDesc = searchParams.get("error_description");

  // Handle OAuth denial or error from provider
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError;
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent(msg)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("No authorization code received")}`
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Authentication service unavailable")}`
    );
  }

  // Create a Supabase client that can set cookies on the response
  const response = NextResponse.redirect(`${origin}/rep/`);

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
    console.error("[auth/rep-callback] Code exchange failed:", exchangeError.message);
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Sign in failed. Please try again.")}`
    );
  }

  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Could not retrieve your account details.")}`
    );
  }

  // Service role client for DB operations
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("[auth/rep-callback] SUPABASE_SERVICE_ROLE_KEY not configured");
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Authentication service misconfigured.")}`
    );
  }

  const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
  const orgId = getOrgIdFromRequest(request);
  const email = user.email.toLowerCase().trim();

  // ── Look up existing rep by auth_user_id ──
  let { data: rep } = await adminClient
    .from(TABLES.REPS)
    .select("id, status, auth_user_id, email")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .single();

  // ── Fallback: look up by email ──
  if (!rep) {
    const { data: repByEmail } = await adminClient
      .from(TABLES.REPS)
      .select("id, status, auth_user_id, email")
      .eq("email", email)
      .eq("org_id", orgId)
      .single();

    if (repByEmail) {
      // Link auth_user_id if not already set
      if (!repByEmail.auth_user_id) {
        await adminClient
          .from(TABLES.REPS)
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", repByEmail.id);
      }
      rep = repByEmail;
    }
  }

  // ── Tag is_rep in app_metadata ──
  try {
    await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { is_rep: true },
    });
  } catch (err) {
    console.error("[auth/rep-callback] Failed to tag rep metadata:", err);
  }

  if (rep) {
    // Existing rep — check status
    if (rep.status === "suspended" || rep.status === "deactivated") {
      await supabase.auth.signOut();
      const errorResponse = NextResponse.redirect(
        `${origin}/rep/login?error=${encodeURIComponent("Your account has been deactivated. Please contact support.")}`
      );
      request.cookies.getAll().forEach((cookie) => {
        if (cookie.name.startsWith("sb-")) {
          errorResponse.cookies.delete(cookie.name);
        }
      });
      return errorResponse;
    }

    // Ensure customer record exists (fire-and-forget)
    ensureRepCustomer({
      supabase: adminClient,
      repId: rep.id,
      orgId,
      email,
      firstName: user.user_metadata?.full_name?.split(" ")[0] || "",
      lastName: user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || "",
    }).catch(() => {});

    // Copy cookies to the redirect response
    return response;
  }

  // ── No rep found — create a new one ──
  const settings = await getRepSettings(orgId);
  const firstName = user.user_metadata?.full_name?.split(" ")[0] || user.user_metadata?.name?.split(" ")[0] || "Rep";
  const lastName = user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || user.user_metadata?.name?.split(" ").slice(1).join(" ") || "";
  const status = settings.auto_approve ? "active" : "pending";

  const { data: newRep, error: repError } = await adminClient
    .from(TABLES.REPS)
    .insert({
      org_id: orgId,
      auth_user_id: user.id,
      status,
      email,
      first_name: firstName,
      last_name: lastName,
      display_name: `${firstName} ${lastName.charAt(0) || ""}`.trim() + (lastName.charAt(0) ? "." : ""),
      photo_url: user.user_metadata?.avatar_url || null,
      points_balance: 0,
      currency_balance: 0,
      total_sales: 0,
      total_revenue: 0,
      level: 1,
      onboarding_completed: false,
    })
    .select("id, status")
    .single();

  if (repError) {
    console.error("[auth/rep-callback] Failed to create rep:", repError);
    // If it's a duplicate email, the user might have an existing rep
    if (repError.message?.includes("unique") || repError.message?.includes("duplicate")) {
      // Try to sign in anyway — auth-check will handle the rest
      return response;
    }
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/rep/login?error=${encodeURIComponent("Failed to create your rep account. Please try again.")}`
    );
  }

  // Ensure customer record (fire-and-forget)
  ensureRepCustomer({
    supabase: adminClient,
    repId: newRep.id,
    orgId,
    email,
    firstName,
    lastName,
  }).catch(() => {});

  // Send welcome email only for auto-approved reps (pending reps get it when approved)
  if (newRep.status === "active") {
    sendRepEmail({
      type: "welcome",
      repId: newRep.id,
      orgId,
      data: {},
    }).catch((err) => {
      console.error("[auth/rep-callback] Failed to send welcome email:", err);
    });

    // Auto-assign to all events
    autoAssignRepToAllEvents({
      supabase: adminClient,
      repId: newRep.id,
      orgId,
      repFirstName: firstName,
    }).catch((err) => {
      console.error("[auth/rep-callback] Failed to auto-assign events:", err);
    });
  }

  return response;
}
