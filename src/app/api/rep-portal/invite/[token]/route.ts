import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";
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
      email,
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

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
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

    // Check if invite already accepted
    if (rep.auth_user_id && rep.status === "active") {
      return NextResponse.json(
        { error: "This invite has already been accepted" },
        { status: 409 }
      );
    }

    // Determine which email to use (prefer email from body over placeholder in DB)
    const finalEmail = (email || rep.email).trim().toLowerCase();

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
          return NextResponse.json(
            {
              error:
                "An account with this email already exists. Please log in instead.",
            },
            { status: 409 }
          );
        }
        console.error(
          "[rep-portal/invite] Admin createUser error:",
          adminError
        );
        return NextResponse.json(
          { error: adminError.message },
          { status: 400 }
        );
      }
      authUserId = adminAuth.user?.id || null;
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

    // Send welcome email (fire-and-forget)
    sendRepEmail({
      type: "welcome",
      repId: rep.id,
      orgId: ORG_ID,
    }).catch(() => {});

    return NextResponse.json({
      data: { rep_id: rep.id, status: "active" },
    });
  } catch (err) {
    console.error("[rep-portal/invite] POST error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
