import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * GET /api/rep-portal/invite/[token] — Validate an invite token (public)
 *
 * Returns invite validity and basic rep info for the signup form.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ valid: false });
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: rep, error } = await supabase
      .from(TABLES.REPS)
      .select("id, first_name, email, org_id, status, auth_user_id")
      .eq("invite_token", token)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !rep) {
      return NextResponse.json({ valid: false });
    }

    // If rep already has an auth user and is active, invite already accepted
    if (rep.auth_user_id && rep.status === "active") {
      return NextResponse.json({
        valid: false,
        reason: "Invite has already been accepted",
      });
    }

    return NextResponse.json({
      valid: true,
      rep: {
        first_name: rep.first_name,
        email: rep.email,
        org_id: rep.org_id,
      },
    });
  } catch (err) {
    console.error("[rep-portal/invite] GET error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rep-portal/invite/[token] — Accept an invite (public)
 *
 * Creates a Supabase auth user for the invited rep, activates the rep,
 * and sends a welcome email.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const {
      password,
      first_name,
      last_name,
      phone,
      instagram,
      tiktok,
      date_of_birth,
      gender,
      bio,
    } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Invite token is required" },
        { status: 400 }
      );
    }

    if (!password || password.length < 6 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be 6-72 characters" },
        { status: 400 }
      );
    }

    if ((first_name && first_name.length > 50) || (last_name && last_name.length > 50)) {
      return NextResponse.json(
        { error: "Name fields must be under 50 characters" },
        { status: 400 }
      );
    }

    if (phone && phone.length > 20) {
      return NextResponse.json(
        { error: "Phone must be under 20 characters" },
        { status: 400 }
      );
    }

    if ((instagram && instagram.length > 30) || (tiktok && tiktok.length > 30)) {
      return NextResponse.json(
        { error: "Social handles must be under 30 characters" },
        { status: 400 }
      );
    }

    if (bio && bio.length > 500) {
      return NextResponse.json(
        { error: "Bio must be under 500 characters" },
        { status: 400 }
      );
    }

    if (gender && !["male", "female", "non-binary", "prefer-not-to-say"].includes(gender)) {
      return NextResponse.json(
        { error: "Invalid gender value" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Find the rep by invite token
    const { data: rep, error: repError } = await supabase
      .from(TABLES.REPS)
      .select("id, email, first_name, last_name, org_id, status, auth_user_id")
      .eq("invite_token", token)
      .eq("org_id", ORG_ID)
      .single();

    if (repError || !rep) {
      return NextResponse.json(
        { error: "Invalid or expired invite token" },
        { status: 404 }
      );
    }

    // Check if invite already accepted (auth_user_id set means auth user exists)
    if (rep.auth_user_id) {
      return NextResponse.json(
        { error: "This invite has already been accepted" },
        { status: 409 }
      );
    }

    // Prevent suspended or deactivated reps from reactivating via invite
    if (rep.status === "suspended" || rep.status === "deactivated") {
      return NextResponse.json(
        { error: "This account has been suspended or deactivated" },
        { status: 403 }
      );
    }

    // Always use the email from the database — never accept an override from the client
    const finalEmail = rep.email.trim().toLowerCase();

    // Create auth user — use admin API if service role key available (auto-confirms email)
    let authUserId: string | null = null;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (serviceRoleKey && SUPABASE_URL) {
      const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
      const { data: adminAuth, error: adminError } =
        await adminClient.auth.admin.createUser({
          email: finalEmail,
          password,
          email_confirm: true,
        });
      if (adminError) {
        if (
          adminError.message?.includes("already registered") ||
          adminError.message?.includes("already been registered")
        ) {
          // Auth user already exists (e.g., rep was deleted and re-invited).
          // Look up the existing user, update their password, and re-link.
          const { data: userList } = await adminClient.auth.admin.listUsers();
          const existingUser = userList?.users?.find(
            (u) => u.email?.toLowerCase() === finalEmail
          );
          if (existingUser) {
            // Update the existing auth user's password so the new invite's password works
            const { error: updateErr } = await adminClient.auth.admin.updateUserById(
              existingUser.id,
              { password, email_confirm: true }
            );
            if (updateErr) {
              console.error("[rep-portal/invite] Failed to update existing auth user:", updateErr);
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
          console.error(
            "[rep-portal/invite] Admin createUser error:",
            adminError
          );
          return NextResponse.json(
            { error: adminError.message },
            { status: 400 }
          );
        }
      } else {
        authUserId = adminAuth.user?.id || null;
      }
    } else {
      // Fallback: regular signUp (may require email confirmation depending on Supabase settings)
      const { data: authData, error: authError } =
        await supabase.auth.signUp({
          email: finalEmail,
          password,
        });
      if (authError) {
        if (authError.message?.includes("already registered")) {
          return NextResponse.json(
            {
              error:
                "An account with this email already exists. Please log in instead.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: authError.message },
          { status: 400 }
        );
      }
      authUserId = authData.user?.id || null;
    }

    if (!authUserId) {
      return NextResponse.json(
        { error: "Failed to create auth user" },
        { status: 500 }
      );
    }

    // Build update payload with provided fields
    const updatePayload: Record<string, unknown> = {
      auth_user_id: authUserId,
      email: finalEmail,
      status: "active",
      onboarding_completed: true,
      invite_token: null,
      updated_at: new Date().toISOString(),
    };

    if (first_name) updatePayload.first_name = first_name.trim();
    if (last_name) updatePayload.last_name = last_name.trim();
    if (first_name || last_name) {
      const fn = (first_name || rep.first_name || "").trim();
      const ln = (last_name || rep.last_name || "").trim();
      updatePayload.display_name = `${fn} ${ln.charAt(0)}.`;
    }
    if (phone !== undefined) updatePayload.phone = phone || null;
    if (instagram !== undefined) updatePayload.instagram = instagram || null;
    if (tiktok !== undefined) updatePayload.tiktok = tiktok || null;
    if (date_of_birth !== undefined) updatePayload.date_of_birth = date_of_birth || null;
    if (gender !== undefined) updatePayload.gender = gender || null;
    if (bio !== undefined) updatePayload.bio = bio || null;

    // Update the rep row
    const { error: updateError } = await supabase
      .from(TABLES.REPS)
      .update(updatePayload)
      .eq("id", rep.id)
      .eq("org_id", ORG_ID);

    if (updateError) {
      console.error("[rep-portal/invite] Failed to update rep:", updateError);
      return NextResponse.json(
        { error: "Failed to activate rep account" },
        { status: 500 }
      );
    }

    // Sign in the newly created user to get session tokens for auto-login
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

    // Send welcome email (fire-and-forget)
    sendRepEmail({
      type: "welcome",
      repId: rep.id,
      orgId: ORG_ID,
    }).catch(() => {});

    return NextResponse.json({
      data: { rep_id: rep.id, status: "active", email: finalEmail, session },
    });
  } catch (err) {
    console.error("[rep-portal/invite] POST error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
