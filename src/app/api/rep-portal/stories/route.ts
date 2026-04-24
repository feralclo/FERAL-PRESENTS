import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/stories — Create a new story
 *
 * Body (all Spotify fields REQUIRED — product decision, no silent-track posts):
 *   {
 *     media_url: string,                 // upload via /uploads/signed-url (kind: story_image|story_video)
 *     media_kind: 'image' | 'video',
 *     media_width?: int, media_height?: int, duration_ms?: int,
 *     caption?: string,                  // <= 500 chars
 *     spotify_track_id:      string,     // mandatory
 *     spotify_preview_url:   string,     // mandatory (Spotify 30s preview)
 *     spotify_track_title:   string,
 *     spotify_track_artist:  string,
 *     spotify_album_image_url?: string,
 *     spotify_clip_start_ms?:  int (default 0),
 *     spotify_clip_length_ms?: int (default 30000, max 30000),
 *     event_id?: uuid,                   // optional scoping
 *     promoter_id?: uuid,
 *     visibility?: 'public' | 'followers' (default 'public'),
 *     expires_at?: ISO8601               // default now + 24h
 *   }
 *
 * Response: 201 { id, created_at, expires_at }
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

    // --- Media validation ---------------------------------------------------
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
    const mediaWidth  = numOrNull(body.media_width);
    const mediaHeight = numOrNull(body.media_height);
    const durationMs  = numOrNull(body.duration_ms);
    const caption =
      typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;
    if (caption && caption.length > 500) {
      return NextResponse.json({ error: "caption must be 500 chars or fewer" }, { status: 400 });
    }

    // --- Spotify (MANDATORY) -----------------------------------------------
    // Product rule: every story has music. Reject any missing-track payload
    // at the API boundary so iOS can't silently drop it and ship a broken UX.
    const spotifyTrackId = typeof body.spotify_track_id === "string" ? body.spotify_track_id.trim() : "";
    const spotifyPreviewUrl = typeof body.spotify_preview_url === "string" ? body.spotify_preview_url : "";
    const spotifyTrackTitle = typeof body.spotify_track_title === "string" ? body.spotify_track_title.trim() : "";
    const spotifyTrackArtist = typeof body.spotify_track_artist === "string" ? body.spotify_track_artist.trim() : "";
    if (!spotifyTrackId || !spotifyPreviewUrl || !spotifyTrackTitle || !spotifyTrackArtist) {
      return NextResponse.json(
        {
          error: "spotify_track_required",
          message:
            "spotify_track_id, spotify_preview_url, spotify_track_title and spotify_track_artist are required",
        },
        { status: 400 }
      );
    }
    if (!URL_RE.test(spotifyPreviewUrl)) {
      return NextResponse.json({ error: "spotify_preview_url must be a valid URL" }, { status: 400 });
    }
    const spotifyAlbumImage =
      typeof body.spotify_album_image_url === "string" && URL_RE.test(body.spotify_album_image_url)
        ? body.spotify_album_image_url
        : null;
    const clipStartMs = clampInt(body.spotify_clip_start_ms, 0, 0, 30 * 60_000); // 30 min upper bound
    const clipLengthMs = clampInt(body.spotify_clip_length_ms, 30_000, 1_000, 30_000);

    // --- Optional scoping ---------------------------------------------------
    const eventId = typeof body.event_id === "string" && UUID_RE.test(body.event_id) ? body.event_id : null;
    const promoterId =
      typeof body.promoter_id === "string" && UUID_RE.test(body.promoter_id) ? body.promoter_id : null;

    // --- Visibility + expiry ------------------------------------------------
    const visibilityRaw = body.visibility;
    const visibility =
      visibilityRaw === "followers" ? "followers" : "public";

    let expiresAt: string;
    if (typeof body.expires_at === "string") {
      const parsed = Date.parse(body.expires_at);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: "expires_at must be a valid ISO timestamp" }, { status: 400 });
      }
      const now = Date.now();
      // Clamp to at most 72h future, minimum 5 min future.
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

    const { data, error } = await db
      .from("rep_stories")
      .insert({
        org_id: auth.rep.org_id,
        author_rep_id: auth.rep.id,
        media_url: mediaUrl,
        media_kind: mediaKind,
        media_width: mediaWidth,
        media_height: mediaHeight,
        duration_ms: durationMs,
        caption,
        spotify_track_id: spotifyTrackId,
        spotify_preview_url: spotifyPreviewUrl,
        spotify_track_title: spotifyTrackTitle,
        spotify_track_artist: spotifyTrackArtist,
        spotify_album_image_url: spotifyAlbumImage,
        spotify_clip_start_ms: clipStartMs,
        spotify_clip_length_ms: clipLengthMs,
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
      { id: data.id, created_at: data.created_at, expires_at: data.expires_at },
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
