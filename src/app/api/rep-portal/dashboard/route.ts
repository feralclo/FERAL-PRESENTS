import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getRepSettings, getPlatformXPConfig } from "@/lib/rep-points";

/**
 * GET /api/rep-portal/dashboard — Dashboard data (protected)
 *
 * Returns aggregated stats, level info, active quests/rewards counts,
 * leaderboard position, recent sales, and active events for the current rep.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Fetch rep, settings, and counts in parallel
    const [
      repResult,
      settingsResult,
      questsResult,
      pendingRewardsResult,
      leaderboardResult,
      recentSalesResult,
      activeEventsResult,
    ] = await Promise.all([
      // Full rep row (include name/photo for dashboard display)
      supabase
        .from(TABLES.REPS)
        .select("first_name, display_name, photo_url, points_balance, currency_balance, total_sales, total_revenue, level")
        .eq("id", repId)
        .eq("org_id", orgId)
        .single(),

      // Program settings (tenant)
      getRepSettings(orgId),

      // Active quests count (global or assigned to rep's events)
      getActiveQuestsCount(supabase, repId, orgId),

      // Pending reward claims count
      supabase
        .from(TABLES.REP_REWARD_CLAIMS)
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .eq("org_id", orgId)
        .eq("status", "claimed"),

      // Leaderboard: all active reps ordered by total_revenue
      supabase
        .from(TABLES.REPS)
        .select("id, total_revenue")
        .eq("org_id", orgId)
        .eq("status", "active")
        .order("total_revenue", { ascending: false }),

      // Recent sales: last 5 orders attributed to this rep
      supabase
        .from(TABLES.ORDERS)
        .select("id, order_number, total, status, created_at, event:events(id, name, slug)")
        .eq("org_id", orgId)
        .eq("metadata->>rep_id", repId)
        .order("created_at", { ascending: false })
        .limit(5),

      // Active events assigned to this rep
      supabase
        .from(TABLES.REP_EVENTS)
        .select("id, event_id, sales_count, revenue, assigned_at, event:events(id, name, slug, date_start, status, cover_image)")
        .eq("rep_id", repId)
        .eq("org_id", orgId),
    ]);

    const rep = repResult.data;
    if (!rep) {
      return NextResponse.json(
        { error: "Rep not found" },
        { status: 404 }
      );
    }

    const settings = settingsResult;

    // Use platform config for level names/thresholds
    const platformConfig = await getPlatformXPConfig();
    const levelIndex = rep.level - 1;
    const levelName =
      platformConfig.level_names[levelIndex] || `Level ${rep.level}`;
    const currentLevelPoints =
      levelIndex > 0 ? platformConfig.level_thresholds[levelIndex - 1] : 0;
    const nextLevelPoints =
      levelIndex < platformConfig.level_thresholds.length
        ? platformConfig.level_thresholds[levelIndex]
        : null;

    // Calculate leaderboard position
    let leaderboardPosition: number | null = null;
    if (leaderboardResult.data) {
      const idx = leaderboardResult.data.findIndex(
        (r: { id: string }) => r.id === repId
      );
      leaderboardPosition = idx >= 0 ? idx + 1 : null;
    }

    // Flatten active_events to match frontend interface: { id, name, sales_count, revenue }
    const flatEvents = (activeEventsResult.data || []).map(
      (ae: Record<string, unknown>) => {
        const evt = ae.event as Record<string, unknown> | null;
        return {
          id: ae.event_id || ae.id,
          name: evt?.name || "Unknown Event",
          sales_count: ae.sales_count || 0,
          revenue: ae.revenue || 0,
        };
      }
    );

    return NextResponse.json({
      data: {
        rep: {
          first_name: rep.first_name,
          display_name: rep.display_name,
          photo_url: rep.photo_url,
          points_balance: rep.points_balance,
          currency_balance: rep.currency_balance ?? 0,
          total_sales: rep.total_sales,
          total_revenue: rep.total_revenue,
          level: rep.level,
        },
        currency_name: settings.currency_name || "FRL",
        level_name: levelName,
        next_level_points: nextLevelPoints,
        current_level_points: currentLevelPoints,
        active_quests: questsResult,
        pending_rewards: pendingRewardsResult.count || 0,
        leaderboard_position: leaderboardPosition,
        recent_sales: recentSalesResult.data || [],
        active_events: flatEvents,
      },
    });
  } catch (err) {
    console.error("[rep-portal/dashboard] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Count active quests available to a rep.
 * Quests are available if they are global (event_id is null)
 * or their event_id is in the rep's assigned events.
 */
async function getActiveQuestsCount(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  repId: string,
  orgId: string
): Promise<number> {
  try {
    if (!supabase) return 0;

    // Get rep's assigned event IDs
    const { data: repEvents } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("event_id")
      .eq("rep_id", repId)
      .eq("org_id", orgId);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const eventIds = (repEvents || [])
      .map((re: { event_id: string }) => re.event_id)
      .filter((id: string) => uuidRegex.test(id));

    // Count active quests: global OR assigned to rep's events
    let query = supabase
      .from(TABLES.REP_QUESTS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active");

    if (eventIds.length > 0) {
      query = query.or(`event_id.is.null,event_id.in.(${eventIds.join(",")})`);
    } else {
      query = query.is("event_id", null);
    }

    const { count } = await query;
    return count || 0;
  } catch {
    return 0;
  }
}
