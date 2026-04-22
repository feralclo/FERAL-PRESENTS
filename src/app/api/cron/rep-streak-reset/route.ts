import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/cron/rep-streak-reset
 *
 * Daily at 00:05 UTC. Zeros out current_streak for any rep who hasn't
 * been active for 2+ days — so the home screen the morning after a
 * broken streak already reads "0", rather than waiting for the next
 * app open to reset via mark_rep_active.
 *
 * best_streak is preserved — that's the lifetime record.
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

  const { data, error } = await db.rpc("reset_stale_streaks");

  if (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json({ reset_count: data ?? 0 });
}
