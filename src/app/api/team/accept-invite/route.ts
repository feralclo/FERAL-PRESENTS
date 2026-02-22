import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TABLES, ORG_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter("team-accept-invite", { limit: 5, windowSeconds: 900 });

/**
 * Get a Supabase client with service role key for public invite routes.
 */
function getInviteClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && SUPABASE_URL) {
    return createClient(SUPABASE_URL, serviceRoleKey);
  }
  return null;
}

/**
 * GET /api/team/accept-invite?token=X — Validate an invite token (public).
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, reason: "No token provided" });
    }

    const supabase = getInviteClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Fetch member and org branding in parallel
    const [memberResult, brandingResult, generalResult] = await Promise.all([
      supabase
        .from(TABLES.ORG_USERS)
        .select("id, email, first_name, last_name, status, auth_user_id, invite_expires_at, perm_events, perm_orders, perm_marketing, perm_finance")
        .eq("invite_token", token)
        .eq("org_id", ORG_ID)
        .single(),
      supabase
        .from("site_settings")
        .select("data")
        .eq("key", `${ORG_ID}_branding`)
        .single(),
      supabase
        .from("site_settings")
        .select("data")
        .eq("key", `${ORG_ID}_general`)
        .single(),
    ]);

    const member = memberResult.data;
    if (memberResult.error || !member) {
      return NextResponse.json({ valid: false, reason: "Invalid or expired invite" });
    }

    // Already accepted
    if (member.status === "active" && member.auth_user_id) {
      return NextResponse.json({ valid: false, reason: "Invite has already been accepted" });
    }

    // Check expiry
    if (member.invite_expires_at && new Date(member.invite_expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: "Invite has expired" });
    }

    // Build org info from branding + general settings
    const branding = (brandingResult.data?.data as Record<string, string>) || {};
    const general = (generalResult.data?.data as Record<string, string>) || {};
    const orgName = branding.org_name || general.org_name || ORG_ID.toUpperCase();

    return NextResponse.json({
      valid: true,
      member: {
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        perm_events: member.perm_events,
        perm_orders: member.perm_orders,
        perm_marketing: member.perm_marketing,
        perm_finance: member.perm_finance,
      },
      org: {
        name: orgName,
        accent_color: branding.accent_color || null,
        logo: branding.logo || null,
      },
    });
  } catch (err) {
    console.error("[team/accept-invite] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/team/accept-invite — Accept invite + create auth user (public, rate-limited).
 */
export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token) {
      return NextResponse.json({ error: "Invite token is required" }, { status: 400 });
    }

    if (!password || password.length < 6 || password.length > 72) {
      return NextResponse.json({ error: "Password must be 6-72 characters" }, { status: 400 });
    }

    const supabase = getInviteClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Find the member by invite token
    const { data: member, error: memberError } = await supabase
      .from(TABLES.ORG_USERS)
      .select("id, email, first_name, last_name, status, auth_user_id, invite_expires_at")
      .eq("invite_token", token)
      .eq("org_id", ORG_ID)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: "Invalid or expired invite token" }, { status: 404 });
    }

    // Already accepted
    if (member.status === "active" && member.auth_user_id) {
      return NextResponse.json({ error: "This invite has already been accepted" }, { status: 409 });
    }

    // Check expiry
    if (member.invite_expires_at && new Date(member.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: "This invite has expired. Ask your team owner to resend it." }, { status: 410 });
    }

    // Suspended members can't reactivate via invite
    if (member.status === "suspended") {
      return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
    }

    const finalEmail = member.email.trim().toLowerCase();

    // Create auth user via admin API (auto-confirms email)
    let authUserId: string | null = null;

    const { data: adminAuth, error: adminError } = await supabase.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
      app_metadata: { is_admin: true },
    });

    if (adminError) {
      if (
        adminError.message?.includes("already registered") ||
        adminError.message?.includes("already been registered")
      ) {
        // Auth user already exists — update password and add is_admin flag
        const { data: userList } = await supabase.auth.admin.listUsers();
        const existingUser = userList?.users?.find(
          (u) => u.email?.toLowerCase() === finalEmail
        );

        if (existingUser) {
          const { error: updateErr } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password, email_confirm: true, app_metadata: { is_admin: true } }
          );
          if (updateErr) {
            console.error("[team/accept-invite] Failed to update existing auth user:", updateErr);
            return NextResponse.json(
              { error: "Failed to set up your account. Please contact support." },
              { status: 500 }
            );
          }
          authUserId = existingUser.id;
        } else {
          return NextResponse.json(
            { error: "Account setup failed. Please contact support." },
            { status: 500 }
          );
        }
      } else {
        console.error("[team/accept-invite] Admin createUser error:", adminError);
        return NextResponse.json({ error: adminError.message }, { status: 400 });
      }
    } else {
      authUserId = adminAuth.user?.id || null;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "Failed to create user account" }, { status: 500 });
    }

    // Update org_users: activate, link auth user, clear invite token
    const { error: updateError } = await supabase
      .from(TABLES.ORG_USERS)
      .update({
        auth_user_id: authUserId,
        status: "active",
        invite_token: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id)
      .eq("org_id", ORG_ID);

    if (updateError) {
      console.error("[team/accept-invite] Failed to activate member:", updateError);
      return NextResponse.json({ error: "Failed to activate account" }, { status: 500 });
    }

    // Sign in to get session tokens for auto-login
    let session: { access_token: string; refresh_token: string } | null = null;
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: signInData } = await anonClient.auth.signInWithPassword({
        email: finalEmail,
        password,
      });
      if (signInData?.session) {
        session = {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        };
      }
    }

    return NextResponse.json({
      data: {
        member_id: member.id,
        status: "active",
        email: finalEmail,
        session,
      },
    });
  } catch (err) {
    console.error("[team/accept-invite] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
