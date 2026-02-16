import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/reps/events/leaderboard/[eventId]/lock
 *
 * Locks an event's leaderboard:
 * 1. Fetches current standings from rep_events
 * 2. Awards position rewards to the top reps
 * 3. Creates rep_reward_claims for each awarded position
 * 4. Awards points for position rewards (optional via body.award_points)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { eventId } = await params;
    const body = await request.json().catch(() => ({}));
    const awardPoints = body.award_points ?? false;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Check position rewards exist for this event
    const { data: positionRewards, error: prError } = await supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .select("*")
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId)
      .order("position", { ascending: true });

    if (prError) {
      return NextResponse.json({ error: prError.message }, { status: 500 });
    }

    if (!positionRewards || positionRewards.length === 0) {
      return NextResponse.json(
        { error: "No position rewards configured for this event" },
        { status: 400 }
      );
    }

    // Check if already locked
    const isLocked = positionRewards.some((pr) => pr.awarded_rep_id !== null);
    if (isLocked) {
      return NextResponse.json(
        { error: "Leaderboard is already locked" },
        { status: 400 }
      );
    }

    // Get current standings
    const maxPosition = Math.max(...positionRewards.map((pr) => pr.position));
    const { data: standings, error: standingsError } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("rep_id, sales_count, revenue, rep:reps(id, display_name, first_name)")
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId)
      .order("revenue", { ascending: false })
      .limit(maxPosition);

    if (standingsError) {
      return NextResponse.json({ error: standingsError.message }, { status: 500 });
    }

    if (!standings || standings.length === 0) {
      return NextResponse.json(
        { error: "No reps have sales for this event" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const results: { position: number; rep_id: string; reward_name: string }[] = [];

    for (const pr of positionRewards) {
      const standingIndex = pr.position - 1;
      if (standingIndex >= standings.length) continue;

      const standing = standings[standingIndex];
      const rawRep = standing.rep;
      const rep = (Array.isArray(rawRep) ? rawRep[0] : rawRep) as Record<string, unknown> | null;
      const repId = (rep?.id || standing.rep_id) as string;

      // Only award if rep has revenue > 0
      if (Number(standing.revenue) <= 0) continue;

      // Update position reward with awarded rep
      await supabase
        .from(TABLES.REP_EVENT_POSITION_REWARDS)
        .update({ awarded_rep_id: repId, awarded_at: now })
        .eq("id", pr.id)
        .eq("org_id", ORG_ID);

      // Create reward claim if there's a linked reward
      if (pr.reward_id) {
        await supabase
          .from(TABLES.REP_REWARD_CLAIMS)
          .insert({
            org_id: ORG_ID,
            rep_id: repId,
            reward_id: pr.reward_id,
            claim_type: "manual",
            points_spent: 0,
            status: "claimed",
            notes: `Position ${pr.position} reward for event leaderboard`,
          });
      }

      // Optionally award bonus points
      if (awardPoints && pr.position <= 3) {
        const pointsMap: Record<number, number> = { 1: 100, 2: 50, 3: 25 };
        const pts = pointsMap[pr.position] || 0;
        if (pts > 0) {
          // Get current balance
          const { data: currentRep } = await supabase
            .from(TABLES.REPS)
            .select("points_balance")
            .eq("id", repId)
            .eq("org_id", ORG_ID)
            .single();

          if (currentRep) {
            const newBalance = currentRep.points_balance + pts;
            await supabase
              .from(TABLES.REPS)
              .update({ points_balance: newBalance })
              .eq("id", repId)
              .eq("org_id", ORG_ID);

            await supabase
              .from(TABLES.REP_POINTS_LOG)
              .insert({
                org_id: ORG_ID,
                rep_id: repId,
                points: pts,
                balance_after: newBalance,
                source_type: "manual",
                description: `#${pr.position} position reward — event leaderboard`,
                created_by: "system",
              });
          }
        }
      }

      results.push({
        position: pr.position,
        rep_id: repId,
        reward_name: pr.reward_name,
      });
    }

    return NextResponse.json({
      data: {
        locked: true,
        awarded: results,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
