import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getTrack, isConfigured } from "@/lib/spotify/client";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/spotify/tracks/:id
 *
 * Look up a single track by Spotify id. Same DTO shape as a search result.
 * Used when iOS renders an existing story and needs fresh track metadata
 * (e.g. refreshed album art). Per-track cache ~1h inside the client.
 *
 * 404 when Spotify doesn't know the id.
 * 502 when Spotify is unreachable — iOS should fall back to the track
 * snapshot stored on the story row (preview_url, name, artists, etc.).
 */

// Spotify track ids are base62, 22 chars. Be lenient — allow 20–30.
const TRACK_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!TRACK_ID_RE.test(id)) {
      return NextResponse.json(
        { error: "id must be a valid Spotify track id" },
        { status: 400 }
      );
    }

    if (!isConfigured()) {
      return NextResponse.json(
        { error: "spotify_unconfigured" },
        { status: 503 }
      );
    }

    try {
      const track = await getTrack(id);
      if (!track) {
        return NextResponse.json(
          { error: "track_not_found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ data: track });
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        extra: { step: "spotify/tracks", id, repId: auth.rep.id },
      });
      return NextResponse.json(
        { error: "spotify_unreachable" },
        { status: 502 }
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/tracks/[id]] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
