import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import type { RepProgramStats } from "@/types/reps";

/**
 * GET /api/reps/stats — Aggregate program stats
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Total reps
    const { count: totalReps } = await supabase
      .from(TABLES.REPS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID);

    // Active reps
    const { count: activeReps } = await supabase
      .from(TABLES.REPS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .eq("status", "active");

    // Pending applications
    const { count: pendingApplications } = await supabase
      .from(TABLES.REPS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .eq("status", "pending");

    // Total sales and revenue via reps (sum from reps table)
    const { data: repAggregates } = await supabase
      .from(TABLES.REPS)
      .select("total_sales, total_revenue")
      .eq("org_id", ORG_ID);

    let totalSalesViaReps = 0;
    let totalRevenueViaReps = 0;
    if (repAggregates) {
      for (const rep of repAggregates) {
        totalSalesViaReps += rep.total_sales || 0;
        totalRevenueViaReps += rep.total_revenue || 0;
      }
    }

    // Active quests
    const { count: activeQuests } = await supabase
      .from(TABLES.REP_QUESTS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .eq("status", "active");

    // Pending submissions
    const { count: pendingSubmissions } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .eq("status", "pending");

    const stats: RepProgramStats = {
      total_reps: totalReps || 0,
      active_reps: activeReps || 0,
      pending_applications: pendingApplications || 0,
      total_sales_via_reps: totalSalesViaReps,
      total_revenue_via_reps: totalRevenueViaReps,
      active_quests: activeQuests || 0,
      pending_submissions: pendingSubmissions || 0,
    };

    return NextResponse.json({ data: stats });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
