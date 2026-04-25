import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyTrackForStory, isConfigured } from "@/lib/spotify/client";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/stories — Create a new story
 *
 * Body (FULL Spotify snapshot REQUIRED — product decision, no silent posts):
 *   {
 *     media_url, media_kind: 'image' | 'video',
 *     media_width?, media_height?, video_duration_ms?,
 *     caption?,
 *
 *     track: {
 *       id, name, artists: [{id,name}], album: { name, image_url? },
 *       preview_url, external_url, duration_ms
 *     },
 *     track_clip_start_ms?  (default 0),
 *     track_clip_length_ms? (default 30000),
 *     track_start_offset_ms? (default 0, 0..track.duration_ms) — where the
 *       author scrubbed to in the composer; viewers cue the preview here
 *       so everyone hears the same moment.
 *
 *     event_id?, promoter_id?,
 *     visibility?: 'public' | 'followers' (default 'public'),
 *     expires_at? (ISO8601, default now + 24h)
 *   }
 *
 * Track validation:
 *   - Backend verifies track.id against Spotify's /v1/tracks endpoint.
 *   - invalid_spotify_track (400) when Spotify returns 404.
 *   - If Spotify is unreachable, fails OPEN — accepts the post with the
 *     client-provided snapshot and logs a warning. Don't let Spotify
 *     outages block rep posting.
 *
 * Response: 201 { id, created_at, expires_at, track_verified: bool }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^https?:\/\/\S+$/i;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // --- Media ---
    const mediaUrl = typeof body.media_url === "string" ? body.media_url : "";
    if (!URL_RE.test(mediaUrl) || mediaUrl.length > 2000) {
      return NextResponse.json({ error: "media_url must be a valid URL" }, { status: 400 });
    }
    const mediaKind = body.media_kind;
    if (mediaKind !== "image" && mediaKind !== "video") {
      return NextResponse.json(
        { error: "media_kind must be 'image' or 'video'" },
        { status: 400 }
      );
    }
    const mediaWidth = numOrNull(body.media_width);
    const mediaHeight = numOrNull(body.media_height);
    // Story video runtime (not the Spotify clip length — those are separate)
    const videoDurationMs = numOrNull(body.video_duration_ms ?? body.duration_ms);
    const caption =
      typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;
    if (caption && caption.length > 500) {
      return NextResponse.json({ error: "caption must be 500 chars or fewer" }, { status: 400 });
    }

    // --- Spotify track (MANDATORY full snapshot) ---
    const trackObj = body.track as Record<string, unknown> | undefined;
    if (!trackObj || typeof trackObj !== "object") {
      return NextResponse.json(
        {
          error: "spotify_track_required",
          message: "track object with id/name/artists/album/preview_url/external_url/duration_ms is required",
        },
        { status: 400 }
      );
    }

    const trackId = typeof trackObj.id === "string" ? trackObj.id.trim() : "";
    const trackName = typeof trackObj.name === "string" ? trackObj.name.trim() : "";
    const artistsRaw = Array.isArray(trackObj.artists) ? trackObj.artists : null;
    const albumObj = trackObj.album as Record<string, unknown> | undefined;
    const previewUrl = typeof trackObj.preview_url === "string" ? trackObj.preview_url : null;
    const externalUrl = typeof trackObj.external_url === "string" ? trackObj.external_url : "";
    const durationMs =
      typeof trackObj.duration_ms === "number" && Number.isFinite(trackObj.duration_ms)
        ? Math.max(0, Math.round(trackObj.duration_ms))
        : null;

    if (!trackId || !trackName || !artistsRaw || !albumObj || !externalUrl || durationMs == null) {
      return NextResponse.json(
        {
          error: "spotify_track_required",
          message: "track.id, track.name, track.artists, track.album, track.external_url and track.duration_ms are required",
        },
        { status: 400 }
      );
    }

    // Normalise artists array — each element must have { id, name }. Tolerate
    // missing id (some Spotify "various artists" entries have empty ids).
    const artists = artistsRaw
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        id: typeof a.id === "string" ? a.id : "",
        name: typeof a.name === "string" ? a.name.trim() : "",
      }))
      .filter((a) => a.name);
    if (artists.length === 0) {
      return NextResponse.json(
        { error: "track.artists must contain at least one {id,name}" },
        { status: 400 }
      );
    }

    const albumName = typeof albumObj.name === "string" ? albumObj.name.trim() : "";
    const albumImage = typeof albumObj.image_url === "string" && URL_RE.test(albumObj.image_url)
      ? albumObj.image_url
      : null;
    if (!albumName) {
      return NextResponse.json({ error: "track.album.name is required" }, { status: 400 });
    }
    if (previewUrl && !URL_RE.test(previewUrl)) {
      return NextResponse.json({ error: "track.preview_url must be a valid URL" }, { status: 400 });
    }
    if (!URL_RE.test(externalUrl)) {
      return NextResponse.json({ error: "track.external_url must be a valid URL" }, { status: 400 });
    }

    const clipStartMs = clampInt(body.track_clip_start_ms, 0, 0, 30 * 60_000);
    const clipLengthMs = clampInt(body.track_clip_length_ms, 30_000, 1_000, 30_000);
    // Author scrub position — clamp to the track's own duration so we never
    // store an offset past the end. Fall back to the 30-minute safety cap
    // if duration_ms is missing (already validated above, so this is just
    // defence-in-depth).
    const startOffsetCap = Math.min(30 * 60_000, durationMs ?? 30 * 60_000);
    const trackStartOffsetMs = clampInt(body.track_start_offset_ms, 0, 0, startOffsetCap);

    // Server-side verification against Spotify — fail-open per the product rule.
    // Only runs when credentials are present; skipped in local dev without them.
    let trackVerified = false;
    if (isConfigured()) {
      const verification = await verifyTrackForStory(trackId);
      if (verification.ok) {
        trackVerified = true;
      } else if (verification.reason === "not_found") {
        return NextResponse.json(
          { error: "invalid_spotify_track", message: `Spotify has no track with id ${trackId}` },
          { status: 400 }
        );
      }
      // reason === 'unreachable' falls through — accept the post anyway.
    }

    // --- Optional scoping ---
    const eventId =
      typeof body.event_id === "string" && UUID_RE.test(body.event_id) ? body.event_id : null;
    const promoterId =
      typeof body.promoter_id === "string" && UUID_RE.test(body.promoter_id)
        ? body.promoter_id
        : null;

    // --- Visibility + expiry ---
    const visibility = body.visibility === "followers" ? "followers" : "public";

    let expiresAt: string;
    if (typeof body.expires_at === "string") {
      const parsed = Date.parse(body.expires_at);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: "expires_at must be a valid ISO timestamp" }, { status: 400 });
      }
      const now = Date.now();
      const min = now + 5 * 60_000;
      const max = now + 72 * 3600_000;
      if (parsed < min || parsed > max) {
        return NextResponse.json(
          { error: "expires_at must be between 5 minutes and 72 hours from now" },
          { status: 400 }
        );
      }
      expiresAt = new Date(parsed).toISOString();
    } else {
      expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    // Persist — columns use the legacy names (spotify_track_title, etc.) for
    // back-compat with existing tooling, but also write the new columns so
    // the feed/single endpoints can build the richer `track` shape iOS wants.
    const { data, error } = await db
      .from("rep_stories")
      .insert({
        org_id: auth.rep.org_id,
        author_rep_id: auth.rep.id,
        media_url: mediaUrl,
        media_kind: mediaKind,
        media_width: mediaWidth,
        media_height: mediaHeight,
        duration_ms: videoDurationMs,
        caption,
        spotify_track_id: trackId,
        spotify_track_title: trackName,
        spotify_track_artist: artists.map((a) => a.name).join(", "),
        spotify_artists: artists,
        spotify_album_name: albumName,
        spotify_album_image_url: albumImage,
        spotify_preview_url: previewUrl ?? "",
        spotify_external_url: externalUrl,
        spotify_duration_ms: durationMs,
        spotify_clip_start_ms: clipStartMs,
        spotify_clip_length_ms: clipLengthMs,
        track_start_offset_ms: trackStartOffsetMs,
        event_id: eventId,
        promoter_id: promoterId,
        visibility,
        expires_at: expiresAt,
      })
      .select("id, created_at, expires_at")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json({ error: "Failed to create story" }, { status: 500 });
    }

    return NextResponse.json(
      {
        id: data.id,
        created_at: data.created_at,
        expires_at: data.expires_at,
        track_verified: trackVerified,
      },
      { status: 201 }
    );
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  return null;
}
function clampInt(v: unknown, def: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, Math.round(v)));
}
