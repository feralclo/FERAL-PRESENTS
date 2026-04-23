import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/reps/leaderboard — Leaderboard query
 *
 * Modes:
 *   default   → all-time global leaderboard by total_revenue
 *   ?event_id → event-specific from rep_events
 *   ?window=30d → rolling-30-day rank + delta_week from rep_rank_snapshots
 *
 * The 30d mode mirrors the iOS Dashboard masthead: today's rank is the latest
 * weekly snapshot; delta_week is today's rank vs. the next-oldest snapshot
 * that's ≥3 days older (so deltas don't flicker if the cron runs twice in
 * the same week). Falls back to all-time ordering if no snapshots exist.
 */
export async function GET(request: NextRequest) {
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

    const eventId = request.nextUrl.searchParams.get("event_id");
    const window = request.nextUrl.searchParams.get("window");

    if (eventId) {
      // Event-specific leaderboard: query rep_events joined with reps
      const { data, error } = await supabase
        .from(TABLES.REP_EVENTS)
        .select(
          "rep_id, sales_count, revenue, rep:reps(id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance, status)"
        )
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .order("revenue", { ascending: false })
        .limit(200);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const leaderboard = (data || [])
        .filter((row: Record<string, unknown>) => {
          const rep = Array.isArray(row.rep) ? row.rep[0] : row.rep;
          const r = (rep || {}) as Record<string, unknown>;
          return r.status === "active";
        })
        .slice(0, 50)
        .map((row: Record<string, unknown>) => {
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
        });

      return NextResponse.json({ data: leaderboard });
    }

    if (window === "30d") {
      return rolling30dLeaderboard(supabase, orgId);
    }

    // Global leaderboard: query reps directly
    const { data, error } = await supabase
      .from(TABLES.REPS)
      .select(
        "id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance"
      )
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("total_revenue", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function rolling30dLeaderboard(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>,
  orgId: string
) {
  // 1. Find promoter_id for this org (1:1 with org_id).
  const { data: promoter } = await supabase
    .from("promoters")
    .select("id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!promoter?.id) {
    // No promoter row yet — fall through to all-time ordering so the UI has
    // something to render. Rows won't have rank/delta_week.
    const { data, error } = await supabase
      .from(TABLES.REPS)
      .select(
        "id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance"
      )
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("total_revenue", { ascending: false })
      .limit(50);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  }

  // 2. Pull all snapshots for this promoter, newest first.
  const { data: snapRows, error: snapErr } = await supabase
    .from("rep_rank_snapshots")
    .select("rep_id, rank, captured_at")
    .eq("promoter_id", promoter.id)
    .order("captured_at", { ascending: false });

  if (snapErr) {
    return NextResponse.json({ error: snapErr.message }, { status: 500 });
  }

  if (!snapRows || snapRows.length === 0) {
    // No snapshots yet — fall back to all-time ordering.
    const { data, error } = await supabase
      .from(TABLES.REPS)
      .select(
        "id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance"
      )
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("total_revenue", { ascending: false })
      .limit(50);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  }

  // 3. Group by captured day (newest first). First day → today's ranks.
  //    Next day that's ≥3 days older → baseline for delta_week.
  const byDate = new Map<string, Map<string, number>>();
  for (const row of snapRows) {
    const date = String(row.captured_at).slice(0, 10);
    let inner = byDate.get(date);
    if (!inner) {
      inner = new Map<string, number>();
      byDate.set(date, inner);
    }
    inner.set(String(row.rep_id), row.rank as number);
  }
  const dates = Array.from(byDate.keys());
  const todayDate = dates[0]!;
  const todayMap = byDate.get(todayDate)!;
  const pastDate = dates.slice(1).find((d) => {
    const days = (Date.parse(todayDate) - Date.parse(d)) / 86400000;
    return days >= 3;
  });
  const pastMap = pastDate ? byDate.get(pastDate)! : null;

  // 4. Hydrate rep metadata for ranked reps.
  const repIds = Array.from(todayMap.keys());
  if (repIds.length === 0) {
    return NextResponse.json({ data: [] });
  }
  const { data: reps, error: repErr } = await supabase
    .from(TABLES.REPS)
    .select(
      "id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, points_balance, status"
    )
    .in("id", repIds);

  if (repErr) {
    return NextResponse.json({ error: repErr.message }, { status: 500 });
  }

  const leaderboard = (reps ?? [])
    .filter((r) => r.status === "active")
    .map((r) => {
      const id = String(r.id);
      const rank = todayMap.get(id) ?? null;
      const pastRank = pastMap?.get(id);
      const delta_week =
        typeof pastRank === "number" && typeof rank === "number"
          ? pastRank - rank // positive = moved up in rank
          : null;
      return {
        id: r.id,
        display_name: r.display_name,
        first_name: r.first_name,
        last_name: r.last_name,
        photo_url: r.photo_url,
        total_sales: r.total_sales,
        total_revenue: r.total_revenue,
        level: r.level,
        points_balance: r.points_balance,
        rank,
        delta_week,
      };
    })
    .filter((r) => typeof r.rank === "number")
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, 50);

  return NextResponse.json({ data: leaderboard });
}
