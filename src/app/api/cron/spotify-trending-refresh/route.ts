import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { refreshAllPlaylists } from "@/lib/music/playlist-refresh";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/spotify-trending-refresh
 *
 * Every 6h (per vercel.json). Refreshes the trending track pool from the
 * curated Spotify playlist list in src/lib/music/trending-playlists.ts.
 *
 * Per-playlist behavior:
 *   - snapshot_id unchanged → skip the heavy fetch, bump last_refreshed_at
 *   - snapshot_id changed   → fetch all tracks, diff insert/update/delete
 *   - playlist 404'd        → reported as missing (don't purge — could be
 *                             a temporary Spotify hiccup)
 *
 * Stale playlists (in DB but no longer in config) get fully purged at the
 * top of every run.
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
    const { purged, results } = await refreshAllPlaylists(db);
    const errors = results.filter((r) => r.status === "error");
    if (errors.length > 0) {
      Sentry.captureMessage("spotify-trending-refresh: partial failure", {
        level: "warning",
        extra: { errors },
      });
    }
    return NextResponse.json({
      ok: true,
      purged,
      results,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { step: "spotify-trending-refresh" },
    });
    return NextResponse.json(
      {
        error: "refresh_failed",
        detail: err instanceof Error ? err.message.slice(0, 240) : String(err),
      },
      { status: 500 }
    );
  }
}
