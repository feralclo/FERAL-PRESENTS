import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { createNotification } from "@/lib/rep-notifications";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/streak-at-risk
 *
 * Daily at 19:00 UTC. Nudges every active rep with `current_streak >= 1`
 * who has earned zero XP today. Without this nudge a rep loses their
 * streak silently overnight; the 7pm UTC slot is friendly to UK and
 * mainland Europe (rep program's biggest cohort) — late afternoon in
 * the US, evening in the UK, late night in Asia. Single-fire by design;
 * we don't store rep timezones, so attempting per-rep local-7pm would
 * cost a column-add and a much fattier query.
 *
 * Idempotent on calendar day: scans rep_notifications for today's
 * streak_at_risk rows and excludes those reps. Re-running by hand on
 * the same UTC day will only push to reps not yet nudged today.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfDayIso = startOfDay.toISOString();

    // 1. Live streaks live in rep_streaks (rep_id, current_streak, ...).
    // Page in 1k chunks so a future-million-rep table doesn't blow up the
    // response — supabase JS caps at 1000 by default.
    const streakRows: Array<{ rep_id: string; current_streak: number }> = [];
    const PAGE = 1000;
    let from = 0;
    for (let pages = 0; pages < 50; pages += 1) {
      const { data, error } = await db
        .from("rep_streaks")
        .select("rep_id, current_streak")
        .gte("current_streak", 1)
        .range(from, from + PAGE - 1);
      if (error) {
        Sentry.captureException(error, { extra: { step: "fetch_streaks" } });
        break;
      }
      const rows = (data ?? []) as Array<{
        rep_id: string;
        current_streak: number;
      }>;
      streakRows.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    if (streakRows.length === 0) {
      return NextResponse.json({
        candidates: 0,
        nudged: 0,
        already_earned_today: 0,
        already_nudged_today: 0,
      });
    }

    // Resolve org_id (createNotification requires it) + filter to active
    // reps. Suspended/deleted reps don't get nudges even if their streak
    // table row is stale.
    const streakRepIds = streakRows.map((s) => s.rep_id);
    const { data: repRows } = await db
      .from(TABLES.REPS)
      .select("id, org_id")
      .eq("status", "active")
      .in("id", streakRepIds);

    const orgByRepId = new Map<string, string>();
    for (const r of (repRows ?? []) as Array<{ id: string; org_id: string }>) {
      orgByRepId.set(r.id, r.org_id);
    }

    const candidates = streakRows
      .filter((s) => orgByRepId.has(s.rep_id))
      .map((s) => ({
        id: s.rep_id,
        org_id: orgByRepId.get(s.rep_id) as string,
        current_streak: s.current_streak,
      }));

    if (candidates.length === 0) {
      return NextResponse.json({
        candidates: 0,
        nudged: 0,
        already_earned_today: 0,
        already_nudged_today: 0,
      });
    }

    const candidateIds = candidates.map((c) => c.id);

    // 2. Reps who already earned XP today — drop them.
    const { data: earnedToday } = await db
      .from(TABLES.REP_POINTS_LOG)
      .select("rep_id")
      .gte("created_at", startOfDayIso)
      .gt("points_delta", 0)
      .in("rep_id", candidateIds);
    const earnedSet = new Set(
      (earnedToday ?? []).map((r) => (r as { rep_id: string }).rep_id),
    );

    // 3. Reps already nudged today — drop them.
    const { data: alreadyNudged } = await db
      .from(TABLES.REP_NOTIFICATIONS)
      .select("rep_id")
      .eq("type", "streak_at_risk")
      .gte("created_at", startOfDayIso)
      .in("rep_id", candidateIds);
    const nudgedSet = new Set(
      (alreadyNudged ?? []).map((r) => (r as { rep_id: string }).rep_id),
    );

    const targets = candidates.filter(
      (c) => !earnedSet.has(c.id) && !nudgedSet.has(c.id),
    );

    let nudged = 0;
    for (const rep of targets) {
      const streakLabel =
        rep.current_streak === 1
          ? "1-day streak"
          : `${rep.current_streak}-day streak`;
      createNotification({
        repId: rep.id,
        orgId: rep.org_id,
        type: "streak_at_risk",
        title: "Don't break your streak",
        body: `Earn any XP today to keep your ${streakLabel} alive.`,
        link: "/rep",
        metadata: {
          current_streak: rep.current_streak,
          // Bake in the UTC date so iOS / debugging can prove which day
          // the nudge fired for.
          fired_for_utc_date: startOfDayIso.slice(0, 10),
        },
      }).catch((err) => Sentry.captureException(err, { level: "warning" }));
      nudged += 1;
    }

    return NextResponse.json({
      candidates: candidates.length,
      nudged,
      already_earned_today: earnedSet.size,
      already_nudged_today: nudgedSet.size,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: "Failed", details: (err as Error).message },
      { status: 500 },
    );
  }
}
