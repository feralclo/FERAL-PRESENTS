import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/leaderboard/events
 *
 * Returns events the current rep is assigned to, with their position,
 * stats, position rewards, and lock status for each event leaderboard.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;
    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Get all events the rep is assigned to, with event info
    const { data: repEvents, error: reError } = await supabase
      .from(TABLES.REP_EVENTS)
      .select(
        "event_id, sales_count, revenue, event:events(id, name, slug, date_start, status, cover_image)"
      )
      .eq("org_id", orgId)
      .eq("rep_id", repId)
      .order("assigned_at", { ascending: false });

    if (reError) {
      console.error("[rep-portal/leaderboard/events] Error:", reError);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    if (!repEvents || repEvents.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // For each event, get rep count, position, and position rewards
    const eventIds = repEvents.map((re) => {
      const raw = re.event;
      const event = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
      return (event?.id || re.event_id) as string;
    });

    // Batch fetch position rewards for all events
    const { data: allPositionRewards } = await supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .select("event_id, position, reward_name, reward_id, awarded_rep_id, xp_reward, currency_reward")
      .eq("org_id", orgId)
      .in("event_id", eventIds)
      .order("position", { ascending: true });

    // Build event summaries
    const results = await Promise.all(
      repEvents.map(async (re) => {
        const raw = re.event;
        const event = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
        const eventId = (event?.id || re.event_id) as string;

        // Get total reps for this event
        const { count: repsCount } = await supabase
          .from(TABLES.REP_EVENTS)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("event_id", eventId);

        // Get rep's position (how many reps have higher revenue)
        const { count: ahead } = await supabase
          .from(TABLES.REP_EVENTS)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("event_id", eventId)
          .gt("revenue", Number(re.revenue));

        const yourPosition = Number(re.revenue) > 0 || Number(re.sales_count) > 0
          ? (ahead || 0) + 1
          : null;

        // Position rewards for this event
        const eventRewards = (allPositionRewards || [])
          .filter((pr) => pr.event_id === eventId)
          .map((pr) => ({
            position: pr.position as number,
            reward_name: pr.reward_name as string,
            reward_id: pr.reward_id as string | null,
            awarded_rep_id: pr.awarded_rep_id as string | null,
            xp_reward: (pr.xp_reward as number) || 0,
            currency_reward: (pr.currency_reward as number) || 0,
          }));

        const locked = eventRewards.some((pr) => pr.awarded_rep_id !== null);

        return {
          event_id: eventId,
          event_name: (event?.name || "Unknown") as string,
          event_date: (event?.date_start || null) as string | null,
          event_status: (event?.status || "draft") as string,
          cover_image: (event?.cover_image || null) as string | null,
          reps_count: repsCount || 0,
          your_position: yourPosition,
          your_sales: Number(re.sales_count),
          your_revenue: Number(re.revenue),
          locked,
          position_rewards: eventRewards,
        };
      })
    );

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error("[rep-portal/leaderboard/events] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
