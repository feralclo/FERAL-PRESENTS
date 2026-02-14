import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/leaderboard — Public leaderboard (protected)
 *
 * Returns top 50 reps ordered by total_revenue DESC.
 * Optionally filtered by event_id (uses rep_events stats).
 * Always includes current rep's position.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");

    if (eventId) {
      // Event-specific leaderboard from rep_events
      return await getEventLeaderboard(supabase, repId, eventId);
    }

    // Global leaderboard from reps table
    const { data: reps, error } = await supabase
      .from(TABLES.REPS)
      .select("id, display_name, first_name, photo_url, total_sales, total_revenue, level")
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
      const { count } = await supabase
        .from(TABLES.REPS)
        .select("id", { count: "exact", head: true })
        .eq("org_id", ORG_ID)
        .eq("status", "active")
        .gt("total_revenue", 0);

      if (count) {
        // Get how many reps have more revenue
        const { data: currentRep } = await supabase
          .from(TABLES.REPS)
          .select("total_revenue")
          .eq("id", repId)
          .eq("org_id", ORG_ID)
          .single();

        if (currentRep) {
          const { count: ahead } = await supabase
            .from(TABLES.REPS)
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG_ID)
            .eq("status", "active")
            .gt("total_revenue", Number(currentRep.total_revenue));

          currentPosition = (ahead || 0) + 1;
        }
      }
    }

    return NextResponse.json({
      data: {
        leaderboard,
        current_position: currentPosition,
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
 */
async function getEventLeaderboard(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  repId: string,
  eventId: string
) {
  const { data: repEvents, error } = await supabase
    .from(TABLES.REP_EVENTS)
    .select(
      "rep_id, sales_count, revenue, rep:reps(id, display_name, first_name, photo_url, total_sales, total_revenue, level)"
    )
    .eq("org_id", ORG_ID)
    .eq("event_id", eventId)
    .order("revenue", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[rep-portal/leaderboard] Event query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event leaderboard" },
      { status: 500 }
    );
  }

  const leaderboard = (repEvents || []).map(
    (re: Record<string, unknown>, index: number) => {
      const rep = re.rep as Record<string, unknown> | null;
      return {
        id: rep?.id || re.rep_id,
        display_name: rep?.display_name || null,
        first_name: rep?.first_name || null,
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

  return NextResponse.json({
    data: {
      leaderboard,
      current_position: currentPosition,
      event_id: eventId,
    },
  });
}
