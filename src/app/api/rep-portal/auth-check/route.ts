import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";

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
    const adminDb = await getSupabaseAdmin();
    if (!adminDb) {
      return NextResponse.json(
        { authenticated: false, error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Look up rep by auth_user_id
    let { data: rep } = await adminDb
      .from(TABLES.REPS)
      .select("id, email, first_name, status, onboarding_completed")
      .eq("auth_user_id", user.id)
      .eq("org_id", ORG_ID)
      .single();

    // Self-healing: try email-based lookup if auth_user_id not matched
    if (!rep && user.email) {
      const { data: repByEmail } = await adminDb
        .from(TABLES.REPS)
        .select("id, email, first_name, status, onboarding_completed")
        .eq("email", user.email.toLowerCase())
        .eq("org_id", ORG_ID)
        .is("auth_user_id", null)
        .single();

      if (repByEmail) {
        // Auto-link
        await adminDb
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

    // For active reps, include stats for the HUD top bar (no extra API call needed)
    let stats: { xp: number; level: number; rank: number | null; active_quests: number } | undefined;
    if (rep.status === "active") {
      try {
        // Fetch full rep record for points/level
        const { data: fullRep } = await adminDb
          .from(TABLES.REPS)
          .select("points_balance, level")
          .eq("id", rep.id)
          .single();

        // Get rank (position among active reps by total_sales desc)
        const { data: rankData } = await adminDb
          .from(TABLES.REPS)
          .select("id")
          .eq("org_id", ORG_ID)
          .eq("status", "active")
          .order("total_sales", { ascending: false });

        const rankIndex = rankData?.findIndex((r: { id: string }) => r.id === rep.id) ?? -1;

        // Count active quests assigned to this rep
        const { count: questCount } = await adminDb
          .from(TABLES.REP_QUESTS)
          .select("id", { count: "exact", head: true })
          .eq("org_id", ORG_ID)
          .eq("status", "active");

        stats = {
          xp: fullRep?.points_balance || 0,
          level: fullRep?.level || 1,
          rank: rankIndex >= 0 ? rankIndex + 1 : null,
          active_quests: questCount || 0,
        };
      } catch {
        // Stats are best-effort — don't fail the auth check
      }
    }

    return NextResponse.json({
      authenticated: true,
      rep: {
        id: rep.id,
        email: rep.email,
        first_name: rep.first_name,
        status: rep.status,
        onboarding_completed: rep.onboarding_completed,
      },
      ...(stats && { stats }),
    });
  } catch (err) {
    console.error("[auth-check] Error:", err);
    return NextResponse.json(
      { authenticated: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
