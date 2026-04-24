import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/stories/:id  — Single story
 *   Side effect: inserts a (story, viewer) row into rep_story_views if the
 *   viewer hasn't seen it. The view_count trigger on that table increments
 *   the parent's view_count.
 *
 * DELETE /api/rep-portal/stories/:id — Author early-deletes their own story.
 *   Soft delete — sets deleted_at. Feed filter drops it; rep_story_views
 *   rows stay for analytics.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data: story } = await db
      .from("rep_stories")
      .select(
        "id, author_rep_id, media_url, media_kind, media_width, media_height, duration_ms, caption, spotify_track_id, spotify_preview_url, spotify_track_title, spotify_track_artist, spotify_album_image_url, spotify_clip_start_ms, spotify_clip_length_ms, event_id, promoter_id, visibility, view_count, expires_at, created_at, deleted_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (!story || (story as { deleted_at: string | null }).deleted_at) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const s = story as {
      id: string;
      author_rep_id: string;
      media_url: string;
      media_kind: "image" | "video";
      media_width: number | null;
      media_height: number | null;
      duration_ms: number | null;
      caption: string | null;
      spotify_track_id: string;
      spotify_preview_url: string;
      spotify_track_title: string;
      spotify_track_artist: string;
      spotify_album_image_url: string | null;
      spotify_clip_start_ms: number;
      spotify_clip_length_ms: number;
      event_id: string | null;
      promoter_id: string | null;
      visibility: string;
      view_count: number;
      expires_at: string;
      created_at: string;
      deleted_at: string | null;
    };

    // Expired? Hide from everyone except the author (so they can still
    // open their own old stories from a drafts-style screen if we add one).
    if (new Date(s.expires_at).getTime() < Date.now() && s.author_rep_id !== auth.rep.id) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Followers-only visibility → must be a mutual follow (or the author)
    if (s.visibility === "followers" && s.author_rep_id !== auth.rep.id) {
      const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", auth.rep.id)
          .eq("followee_id", s.author_rep_id)
          .maybeSingle(),
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", s.author_rep_id)
          .eq("followee_id", auth.rep.id)
          .maybeSingle(),
      ]);
      if (!iFollow || !followsMe) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
    }

    // Record the view (idempotent — unique on (story_id, viewer_rep_id))
    let viewedByMe = s.author_rep_id === auth.rep.id;
    if (!viewedByMe) {
      const { error: viewError } = await db
        .from("rep_story_views")
        .insert({ story_id: s.id, viewer_rep_id: auth.rep.id });
      const dup = viewError?.code === "23505";
      if (viewError && !dup) {
        Sentry.captureException(viewError, { level: "warning" });
      }
      viewedByMe = true;
    }

    // Re-read view_count after the insert so the returned payload is fresh.
    const { data: refreshed } = await db
      .from("rep_stories")
      .select("view_count")
      .eq("id", s.id)
      .maybeSingle();
    const viewCount = (refreshed as { view_count?: number } | null)?.view_count ?? s.view_count;

    return NextResponse.json({
      data: {
        id: s.id,
        author_rep_id: s.author_rep_id,
        media_url: s.media_url,
        media_kind: s.media_kind,
        media_width: s.media_width,
        media_height: s.media_height,
        duration_ms: s.duration_ms,
        caption: s.caption,
        spotify: {
          track_id: s.spotify_track_id,
          preview_url: s.spotify_preview_url,
          track_title: s.spotify_track_title,
          track_artist: s.spotify_track_artist,
          album_image_url: s.spotify_album_image_url,
          clip_start_ms: s.spotify_clip_start_ms,
          clip_length_ms: s.spotify_clip_length_ms,
        },
        event_id: s.event_id,
        promoter_id: s.promoter_id,
        visibility: s.visibility,
        view_count: viewCount,
        viewed_by_me: viewedByMe,
        is_mine: s.author_rep_id === auth.rep.id,
        expires_at: s.expires_at,
        created_at: s.created_at,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/[id] GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    // Only the author can delete their own story. Use returning-row to
    // tell "not found" from "not yours" without leaking existence.
    const { data, error } = await db
      .from("rep_stories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("author_rep_id", auth.rep.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id, storyId: id } });
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/[id] DELETE] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
