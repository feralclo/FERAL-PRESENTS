import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/leaderboard — Public leaderboard (protected)
 *
 * Returns top 50 reps ordered by total_revenue DESC.
 * Optionally filtered by event_id (uses rep_events stats).
 * Always includes current rep's position.
 * When event_id is provided, includes position rewards and lock status.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");

    if (eventId) {
      return await getEventLeaderboard(supabase, repId, eventId);
    }

    // Global leaderboard from reps table
    const { data: reps, error } = await supabase
      .from(TABLES.REPS)
      .select("id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level")
      .eq("org_id", ORG_ID)
      .eq("status", "active")
      .order("total_revenue", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[rep-portal/leaderboard] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 500 }
      );
    }

    const leaderboard = (reps || []).map(
      (r: Record<string, unknown>, index: number) => ({
        ...r,
        position: index + 1,
      })
    );

    // Find current rep's position
    const currentRepEntry = leaderboard.find(
      (r) => (r as Record<string, unknown>).id === repId
    );
    let currentPosition: number | null = currentRepEntry
      ? currentRepEntry.position
      : null;

    // If current rep isn't in top 50, find their actual position
    if (!currentRepEntry) {
      const { data: currentRep } = await supabase
        .from(TABLES.REPS)
        .select("total_revenue")
        .eq("id", repId)
        .eq("org_id", ORG_ID)
        .single();

      if (currentRep && Number(currentRep.total_revenue) > 0) {
        const { count: ahead } = await supabase
          .from(TABLES.REPS)
          .select("id", { count: "exact", head: true })
          .eq("org_id", ORG_ID)
          .eq("status", "active")
          .gt("total_revenue", Number(currentRep.total_revenue));

        currentPosition = (ahead || 0) + 1;
      }
    }

    return NextResponse.json({
      data: {
        leaderboard,
        current_position: currentPosition,
        current_rep_id: repId,
      },
    });
  } catch (err) {
    console.error("[rep-portal/leaderboard] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Event-specific leaderboard using rep_events table.
 * Includes position rewards and lock status.
 */
async function getEventLeaderboard(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>,
  repId: string,
  eventId: string
) {
  // Fetch leaderboard, event info, and position rewards in parallel
  const [leaderboardResult, eventResult, rewardsResult] = await Promise.all([
    supabase
      .from(TABLES.REP_EVENTS)
      .select(
        "rep_id, sales_count, revenue, rep:reps(id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level)"
      )
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId)
      .order("revenue", { ascending: false })
      .limit(50),
    supabase
      .from(TABLES.EVENTS)
      .select("id, name, date_start, status")
      .eq("id", eventId)
      .eq("org_id", ORG_ID)
      .single(),
    supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .select("position, reward_name, reward_id, awarded_rep_id, xp_reward, currency_reward")
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId)
      .order("position", { ascending: true }),
  ]);

  if (leaderboardResult.error) {
    console.error("[rep-portal/leaderboard] Event query error:", leaderboardResult.error);
    return NextResponse.json(
      { error: "Failed to fetch event leaderboard" },
      { status: 500 }
    );
  }

  const leaderboard = (leaderboardResult.data || []).map(
    (re: Record<string, unknown>, index: number) => {
      const rep = re.rep as Record<string, unknown> | null;
      return {
        id: rep?.id || re.rep_id,
        display_name: rep?.display_name || null,
        first_name: rep?.first_name || null,
        last_name: rep?.last_name || null,
        photo_url: rep?.photo_url || null,
        total_sales: re.sales_count,
        total_revenue: re.revenue,
        level: rep?.level || 1,
        position: index + 1,
      };
    }
  );

  const currentRepEntry = leaderboard.find(
    (r) => r.id === repId
  );
  const currentPosition = currentRepEntry
    ? currentRepEntry.position
    : null;

  const positionRewards = (rewardsResult.data || []).map((pr) => ({
    position: pr.position as number,
    reward_name: pr.reward_name as string,
    reward_id: pr.reward_id as string | null,
    awarded_rep_id: pr.awarded_rep_id as string | null,
    xp_reward: (pr.xp_reward as number) || 0,
    currency_reward: (pr.currency_reward as number) || 0,
  }));

  const locked = positionRewards.some((pr) => pr.awarded_rep_id !== null);

  const event = eventResult.data as Record<string, unknown> | null;

  return NextResponse.json({
    data: {
      leaderboard,
      current_position: currentPosition,
      current_rep_id: repId,
      event_id: eventId,
      event: event ? {
        name: event.name as string,
        date_start: event.date_start as string | null,
        status: event.status as string,
      } : null,
      locked,
      position_rewards: positionRewards,
    },
  });
}
