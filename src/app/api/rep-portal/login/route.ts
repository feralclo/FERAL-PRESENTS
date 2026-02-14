import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * POST /api/rep-portal/login — Rep login (public)
 *
 * Signs in with Supabase Auth, then verifies the user has an active rep row.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
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

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

    if (authError) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (!authData.user || !authData.session) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }

    // Verify the auth user has a rep row
    const { data: rep, error: repError } = await supabase
      .from(TABLES.REPS)
      .select("id, auth_user_id, email, org_id, status, first_name, last_name, display_name, photo_url, level, points_balance, onboarding_completed")
      .eq("auth_user_id", authData.user.id)
      .eq("org_id", ORG_ID)
      .single();

    if (repError || !rep) {
      // Sign out the auth session since they don't have a rep account
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "No rep account found for this email" },
        { status: 403 }
      );
    }

    if (rep.status !== "active") {
      // Sign out the auth session since the rep is not active
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: `Your rep account is ${rep.status}. Please contact support.` },
        { status: 403 }
      );
    }

    return NextResponse.json({
      data: {
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_at: authData.session.expires_at,
        },
        rep,
      },
    });
  } catch (err) {
    console.error("[rep-portal/login] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
