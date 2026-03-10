import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/reps/events/summary — Bulk fetch rep counts + position rewards for all events
 *
 * Returns aggregated data for every event in one call, replacing the N+1 pattern
 * where the admin Event Boards page fetched 2 APIs per event sequentially.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch all rep-event assignments and all position rewards in parallel
    const [assignmentsResult, rewardsResult] = await Promise.all([
      supabase
        .from(TABLES.REP_EVENTS)
        .select("event_id, rep_id, sales_count, revenue")
        .eq("org_id", orgId),
      supabase
        .from(TABLES.REP_EVENT_POSITION_REWARDS)
        .select("event_id, position, reward_name, reward_id, xp_reward, currency_reward, awarded_rep_id, awarded_at")
        .eq("org_id", orgId)
        .order("position", { ascending: true }),
    ]);

    // Aggregate assignments by event
    const eventStats: Record<string, { reps_count: number; total_sales: number; total_revenue: number }> = {};
    for (const a of assignmentsResult.data || []) {
      if (!eventStats[a.event_id]) {
        eventStats[a.event_id] = { reps_count: 0, total_sales: 0, total_revenue: 0 };
      }
      eventStats[a.event_id].reps_count++;
      eventStats[a.event_id].total_sales += a.sales_count || 0;
      eventStats[a.event_id].total_revenue += Number(a.revenue || 0);
    }

    // Group position rewards by event
    const eventRewards: Record<string, typeof rewardsResult.data> = {};
    for (const pr of rewardsResult.data || []) {
      if (!eventRewards[pr.event_id]) eventRewards[pr.event_id] = [];
      eventRewards[pr.event_id]!.push(pr);
    }

    return NextResponse.json({
      data: {
        stats: eventStats,
        rewards: eventRewards,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[reps/events/summary] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
