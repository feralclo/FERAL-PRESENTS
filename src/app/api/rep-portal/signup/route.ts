import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";
import { getRepSettings } from "@/lib/rep-points";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * POST /api/rep-portal/signup — Rep signup (public)
 *
 * Creates a Supabase auth user and a rep row with status "pending"
 * (or "active" if auto_approve is enabled in program settings).
 */
export async function POST(request: NextRequest) {
  try {
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

    // Validate required fields
    if (!email || !password || !first_name || !last_name) {
      return NextResponse.json(
        { error: "Missing required fields: email, password, first_name, last_name" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
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

    // Check if a rep with this email already exists
    const { data: existingRep } = await supabase
      .from(TABLES.REPS)
      .select("id, status")
      .eq("org_id", ORG_ID)
      .eq("email", email.toLowerCase().trim())
      .single();

    if (existingRep) {
      return NextResponse.json(
        { error: "A rep account with this email already exists" },
        { status: 409 }
      );
    }

    // Get program settings to check auto_approve
    const settings = await getRepSettings(ORG_ID);

    // Create Supabase auth user — use admin API if service role key available
    const finalEmail = email.toLowerCase().trim();
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
            { error: "An account with this email already exists" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: adminError.message },
          { status: 400 }
        );
      }
      authUserId = adminAuth.user?.id || null;
    } else {
      const { data: authData, error: authError } =
        await supabase.auth.signUp({
          email: finalEmail,
          password,
        });
      if (authError) {
        if (authError.message?.includes("already registered")) {
          return NextResponse.json(
            { error: "An account with this email already exists" },
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

    const status = settings.auto_approve ? "active" : "pending";
    const inviteToken = crypto.randomUUID();

    // Create rep row
    const { data: rep, error: repError } = await supabase
      .from(TABLES.REPS)
      .insert({
        org_id: ORG_ID,
        auth_user_id: authUserId,
        status,
        email: email.toLowerCase().trim(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        display_name: `${first_name.trim()} ${last_name.trim().charAt(0)}.`,
        phone: phone || null,
        instagram: instagram || null,
        tiktok: tiktok || null,
        date_of_birth: date_of_birth || null,
        gender: gender || null,
        bio: bio || null,
        invite_token: inviteToken,
        points_balance: 0,
        total_sales: 0,
        total_revenue: 0,
        level: 1,
        onboarding_completed: false,
      })
      .select("id, status")
      .single();

    if (repError) {
      console.error("[rep-portal/signup] Failed to create rep row:", repError);
      return NextResponse.json(
        { error: "Failed to create rep account" },
        { status: 500 }
      );
    }

    // If auto-approved, send welcome email (fire-and-forget)
    if (status === "active") {
      sendRepEmail({
        type: "welcome",
        repId: rep.id,
        orgId: ORG_ID,
      }).catch(() => {});
    }

    return NextResponse.json(
      { data: { rep_id: rep.id, status: rep.status } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[rep-portal/signup] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
