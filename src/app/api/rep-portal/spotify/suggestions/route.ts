import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildSuggestions } from "@/lib/music/suggestions";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/rep-portal/spotify/suggestions
 *
 * Returns up to four sections (recent / friends / team / trending) for
 * the iOS Spotify track picker. Empty sections are omitted.
 *
 * Trending is built from a curated pool refreshed every 6h by
 * /api/cron/spotify-trending-refresh. Personalization (affinity weighting)
 * kicks in once the rep has 5+ story track picks; before that, trending
 * does even stratified sampling across all configured playlists.
 *
 * Tracks shown in the trending section are logged to rep_track_impressions
 * for dedup + decay on subsequent calls.
 *
 * Auth: rep bearer token. allowPending so newly-signed-up reps in
 * onboarding can populate their first story picker.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("trending_limit") ?? "20", 10);
    const trendingLimit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(50, rawLimit))
      : 20;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const response = await buildSuggestions(db, auth.rep.id, {
      trendingLimit,
    });
    return NextResponse.json(response);
  } catch (err) {
    Sentry.captureException(err, {
      extra: { step: "rep-portal/spotify/suggestions" },
    });
    console.error("[rep-portal/spotify/suggestions] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
