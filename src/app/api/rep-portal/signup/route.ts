import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TABLES, ORG_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { getRepSettings } from "@/lib/rep-points";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * Create a Supabase client for public-facing rep routes.
 *
 * Uses the service role key (bypasses RLS) when available — required because
 * public signup is unauthenticated, so the anon key can't read/write the reps
 * table if RLS is enabled. Falls back to anon key if service role key is
 * not configured.
 */
function getPublicRepClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && SUPABASE_URL) {
    return createClient(SUPABASE_URL, serviceRoleKey);
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return null;
}

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

    if (password.length < 6 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be 6-72 characters" },
        { status: 400 }
      );
    }

    if (first_name.length > 50 || last_name.length > 50) {
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

    const supabase = getPublicRepClient();
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
      // Fallback: regular signUp — use fresh anon client to avoid session interference
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return NextResponse.json(
          { error: "Service unavailable" },
          { status: 503 }
        );
      }
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: authData, error: authError } =
        await anonClient.auth.signUp({
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

    // If auto-approved, sign in to get session tokens and send welcome email
    let session: { access_token: string; refresh_token: string } | null = null;
    if (status === "active") {
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

      sendRepEmail({
        type: "welcome",
        repId: rep.id,
        orgId: ORG_ID,
      }).catch(() => {});
    }

    return NextResponse.json(
      { data: { rep_id: rep.id, status: rep.status, session } },
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
