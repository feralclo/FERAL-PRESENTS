import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";

/**
 * POST /api/rep-portal/login — Rep login (public)
 *
 * Signs in with Supabase Auth, then verifies the user has an active rep row.
 */
export async function POST(request: NextRequest) {
  try {
    const orgId = getOrgIdFromRequest(request);
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

    // Use admin client for data queries (bypasses RLS)
    const adminDb = await getSupabaseAdmin();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Verify the auth user has a rep row
    const { data: rep, error: repError } = await adminDb
      .from(TABLES.REPS)
      .select("id, auth_user_id, email, org_id, status, first_name, last_name, display_name, photo_url, level, points_balance, onboarding_completed")
      .eq("auth_user_id", authData.user.id)
      .eq("org_id", orgId)
      .single();

    if (repError || !rep) {
      // Self-healing: try matching by email if auth_user_id lookup fails.
      // Only links if the rep has NO existing auth_user_id (prevents account takeover).
      const userEmail = authData.user.email?.toLowerCase();
      if (userEmail) {
        const { data: repByEmail } = await adminDb
          .from(TABLES.REPS)
          .select("id, auth_user_id, email, org_id, status, first_name, last_name, display_name, photo_url, level, points_balance, onboarding_completed")
          .eq("email", userEmail)
          .eq("org_id", orgId)
          .is("auth_user_id", null)
          .single();

        if (repByEmail) {
          console.warn("[rep-portal/login] Auto-linking rep by email:", {
            repId: repByEmail.id,
            authUserId: authData.user.id,
            email: userEmail,
          });
          await adminDb
            .from(TABLES.REPS)
            .update({ auth_user_id: authData.user.id, updated_at: new Date().toISOString() })
            .eq("id", repByEmail.id)
            .eq("org_id", orgId);

          repByEmail.auth_user_id = authData.user.id;

          if (repByEmail.status !== "active") {
            await supabase.auth.signOut();
            return NextResponse.json(
              { error: "Your account is not active. Please contact support." },
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
              rep: repByEmail,
            },
          });
        }
      }

      // Sign out the auth session since they don't have a rep account
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "No rep account found for this email", code: "rep_not_found" },
        { status: 403 }
      );
    }

    if (rep.status !== "active") {
      // Sign out the auth session since the rep is not active
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Your account is not active. Please contact support." },
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
