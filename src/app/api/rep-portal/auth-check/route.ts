import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";

/**
 * GET /api/rep-portal/auth-check — Lightweight rep status check (protected by session)
 *
 * Returns rep status info regardless of active/verified state.
 * Used by the layout to decide which gate screen to show.
 * Does NOT use requireRepAuth() — that would block non-active/unverified reps.
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { authenticated: false, error: "Service unavailable" },
        { status: 503 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Use admin client for rep lookup (bypasses RLS)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const repDb =
      serviceRoleKey && SUPABASE_URL
        ? createClient(SUPABASE_URL, serviceRoleKey)
        : supabase;

    // Look up rep by auth_user_id
    let { data: rep } = await repDb
      .from(TABLES.REPS)
      .select("id, email, first_name, status, email_verified, onboarding_completed")
      .eq("auth_user_id", user.id)
      .eq("org_id", ORG_ID)
      .single();

    // Self-healing: try email-based lookup if auth_user_id not matched
    if (!rep && user.email) {
      const { data: repByEmail } = await repDb
        .from(TABLES.REPS)
        .select("id, email, first_name, status, email_verified, onboarding_completed")
        .eq("email", user.email.toLowerCase())
        .eq("org_id", ORG_ID)
        .is("auth_user_id", null)
        .single();

      if (repByEmail) {
        // Auto-link
        await repDb
          .from(TABLES.REPS)
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", repByEmail.id)
          .eq("org_id", ORG_ID);
        rep = repByEmail;
      }
    }

    if (!rep) {
      return NextResponse.json(
        { authenticated: true, rep: null, code: "rep_not_found" },
        { status: 200 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      rep: {
        id: rep.id,
        email: rep.email,
        first_name: rep.first_name,
        status: rep.status,
        email_verified: rep.email_verified ?? true, // default true for reps without the column yet
        onboarding_completed: rep.onboarding_completed,
      },
    });
  } catch (err) {
    console.error("[auth-check] Error:", err);
    return NextResponse.json(
      { authenticated: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
