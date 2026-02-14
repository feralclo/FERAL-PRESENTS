import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/leaderboard — Leaderboard query
 * Optional ?event_id= for event-specific leaderboard
 */
export async function GET(request: NextRequest) {
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

    const eventId = request.nextUrl.searchParams.get("event_id");

    if (eventId) {
      // Event-specific leaderboard: query rep_events joined with reps
      const { data, error } = await supabase
        .from(TABLES.REP_EVENTS)
        .select(
          "rep_id, sales_count, revenue, rep:reps(id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance)"
        )
        .eq("org_id", ORG_ID)
        .eq("event_id", eventId)
        .order("revenue", { ascending: false })
        .limit(50);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Flatten the joined data
      const leaderboard = (data || []).map(
        (row: Record<string, unknown>) => {
          const rep = Array.isArray(row.rep) ? row.rep[0] : row.rep;
          const r = (rep || {}) as Record<string, unknown>;
          return {
            id: r.id || row.rep_id,
            display_name: r.display_name ?? null,
            first_name: r.first_name ?? null,
            last_name: r.last_name ?? null,
            photo_url: r.photo_url ?? null,
            total_sales: row.sales_count,
            total_revenue: row.revenue,
            level: r.level ?? 1,
            points_balance: r.points_balance ?? 0,
          };
        }
      );

      return NextResponse.json({ data: leaderboard });
    }

    // Global leaderboard: query reps directly
    const { data, error } = await supabase
      .from(TABLES.REPS)
      .select(
        "id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance"
      )
      .eq("org_id", ORG_ID)
      .eq("status", "active")
      .order("total_revenue", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
