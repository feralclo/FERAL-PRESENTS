import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import type { RepProgramStats } from "@/types/reps";

/**
 * GET /api/reps/stats — Aggregate program stats
 *
 * Uses the `get_rep_program_stats` RPC for DB-level aggregation
 * (SUM, COUNT with FILTER) in a single query instead of fetching all rows.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc("get_rep_program_stats", {
      p_org_id: orgId,
    });

    if (error) {
      console.error("[reps/stats] RPC error:", error);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const result = data as Record<string, number>;

    const stats: RepProgramStats = {
      total_reps: result.total_reps || 0,
      active_reps: result.active_reps || 0,
      pending_applications: result.pending_applications || 0,
      total_sales_via_reps: result.total_sales_via_reps || 0,
      total_revenue_via_reps: result.total_revenue_via_reps || 0,
      active_quests: result.active_quests || 0,
      pending_submissions: result.pending_submissions || 0,
    };

    return NextResponse.json({ data: stats });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
