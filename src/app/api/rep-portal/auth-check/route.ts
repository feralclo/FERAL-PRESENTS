import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getRepSettings } from "@/lib/rep-points";
import { getOrgId } from "@/lib/org";
import * as Sentry from "@sentry/nextjs";

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

    const orgId = await getOrgId();

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
      .eq("org_id", orgId)
      .single();

    // Self-healing: try email-based lookup if auth_user_id not matched
    if (!rep && user.email) {
      const { data: repByEmail } = await adminDb
        .from(TABLES.REPS)
        .select("id, email, first_name, status, onboarding_completed")
        .eq("email", user.email.toLowerCase())
        .eq("org_id", orgId)
        .is("auth_user_id", null)
        .single();

      if (repByEmail) {
        // Auto-link
        await adminDb
          .from(TABLES.REPS)
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", repByEmail.id)
          .eq("org_id", orgId);
        rep = repByEmail;
      }
    }

    if (!rep) {
      return NextResponse.json(
        { authenticated: true, rep: null, code: "rep_not_found" },
        { status: 200 }
      );
    }

    // Lightweight stats — only fetch what's already in the rep row (no extra queries)
    // Full stats (rank, quest count) are fetched by the dashboard endpoint instead
    let stats: { xp: number; level: number; rank: number | null; active_quests: number; currency_balance: number; currency_name: string } | undefined;
    if (rep.status === "active") {
      try {
        const [{ data: fullRep }, settings] = await Promise.all([
          adminDb
            .from(TABLES.REPS)
            .select("points_balance, level, currency_balance")
            .eq("id", rep.id)
            .single(),
          getRepSettings(orgId),
        ]);

        stats = {
          xp: fullRep?.points_balance || 0,
          level: fullRep?.level || 1,
          rank: null, // Rank computed by dashboard — too expensive for auth check
          active_quests: 0, // Quest count loaded by dashboard
          currency_balance: fullRep?.currency_balance || 0,
          currency_name: settings.currency_name || "FRL",
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
    Sentry.captureException(err);
    console.error("[auth-check] Error:", err);
    return NextResponse.json(
      { authenticated: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
