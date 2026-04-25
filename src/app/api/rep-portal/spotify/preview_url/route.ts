import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { resolvePreviewUrl } from "@/lib/spotify/preview-resolver";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/spotify/preview_url?track_id=<spotify_id>
 *
 * Optional hints (used when the Spotify lookup has no preview):
 *   &name=<track name>
 *   &artist=<primary artist name>
 *   &isrc=<ISRC>
 *
 * Server-side preview resolver. Runs the chain that iOS build 13 runs
 * client-side, but shared across all clients (iPhone + Android + web)
 * so we fetch each preview once, not three times. iOS pings this when
 * Spotify's own preview_url is null; if we also can't find one the
 * client falls back to its local detection.
 *
 * 200 { data: { url, source, duration_ms, match_note? } }
 * 404 { error: "preview_not_found" } — all three sources gave up
 * 400 when neither track_id nor (name + artist) is provided
 *
 * Auth: rep bearer token. Same surface as the rest of /rep-portal/spotify/*.
 * Rate limit: 60 req / min / IP — enough for a heavy picker session, cheap
 * to exceed only under abuse.
 */

const TRACK_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i;

const previewUrlLimiter = createRateLimiter("spotify-preview-url", {
  limit: 60,
  windowSeconds: 60,
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const blocked = previewUrlLimiter(request);
    if (blocked) return blocked;

    const url = new URL(request.url);
    const trackId = (url.searchParams.get("track_id") ?? "").trim();
    const name = (url.searchParams.get("name") ?? "").trim();
    const artist = (url.searchParams.get("artist") ?? "").trim();
    const isrc = (url.searchParams.get("isrc") ?? "").trim();

    if (trackId && !TRACK_ID_RE.test(trackId)) {
      return NextResponse.json(
        { error: "track_id must be a valid Spotify id" },
        { status: 400 }
      );
    }
    if (isrc && !ISRC_RE.test(isrc)) {
      return NextResponse.json(
        { error: "isrc must be a valid ISRC code" },
        { status: 400 }
      );
    }

    // Need something to resolve against. Either a Spotify id (we can look
    // the track up) or enough metadata to run the iTunes/Deezer ladder.
    if (!trackId && !(name && artist)) {
      return NextResponse.json(
        { error: "track_id or (name + artist) required" },
        { status: 400 }
      );
    }

    const hit = await resolvePreviewUrl({
      track_id: trackId || null,
      name: name || null,
      artist: artist || null,
      isrc: isrc || null,
    });

    if (!hit) {
      return NextResponse.json(
        { error: "preview_not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: hit });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/preview_url] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
