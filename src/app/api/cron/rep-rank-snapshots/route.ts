import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/rep-rank-snapshots
 *
 * Weekly cron (Mondays 02:00 UTC per vercel.json) — snapshots every
 * approved rep's rolling-30-day rank per promoter into rep_rank_snapshots.
 * Drives delta_week on /api/rep-portal/leaderboard.
 *
 * Heavy lifting is in capture_rep_rank_snapshots() PL/pgSQL function so
 * a slow HTTP layer can't fragment the snapshot batch. Idempotent on
 * calendar day — safe to re-run manually if a cron fires twice.
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

  const { data, error } = await db.rpc("capture_rep_rank_snapshots");

  if (error) {
    Sentry.captureException(error, {
      extra: { step: "capture_rep_rank_snapshots" },
    });
    return NextResponse.json(
      { error: "Failed to capture snapshots", details: error.message },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    promoters_processed: row?.promoters_processed ?? 0,
    reps_snapshotted: row?.reps_snapshotted ?? 0,
  });
}
