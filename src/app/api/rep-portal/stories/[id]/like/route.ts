import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchStoryLikesSingle } from "@/lib/story-likes";
import * as Sentry from "@sentry/nextjs";

/**
 * POST   /api/rep-portal/stories/:id/like — like a story
 * DELETE /api/rep-portal/stories/:id/like — unlike a story
 *
 * Both are idempotent. Re-liking a story you already liked, or unliking
 * a story you never liked, both succeed quietly and return the current
 * canonical state.
 *
 * Visibility: the same gate the GET /:id endpoint applies. A rep can
 * only like a story they're allowed to see — followers-only stories
 * require mutual follow.
 *
 * Response (envelope { data: ... }):
 *   { liked, like_count, recent_likers }
 *
 * `recent_likers` is capped at 3, newest first — used by iOS for the
 * inline avatar cluster on the story.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: storyId } = await params;
    if (!UUID_RE.test(storyId)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const me = auth.rep.id;

    // Confirm the story exists, isn't deleted/expired, and the viewer
    // can see it. Don't differentiate the failure modes — 404 either way.
    const { data: story } = await db
      .from("rep_stories")
      .select("id, author_rep_id, visibility, expires_at, deleted_at")
      .eq("id", storyId)
      .maybeSingle();

    if (!story || (story as { deleted_at: string | null }).deleted_at) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const s = story as {
      id: string;
      author_rep_id: string;
      visibility: string;
      expires_at: string;
      deleted_at: string | null;
    };

    const isAuthor = s.author_rep_id === me;
    if (new Date(s.expires_at).getTime() < Date.now() && !isAuthor) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (s.visibility === "followers" && !isAuthor) {
      const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", me)
          .eq("followee_id", s.author_rep_id)
          .maybeSingle(),
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", s.author_rep_id)
          .eq("followee_id", me)
          .maybeSingle(),
      ]);
      if (!iFollow || !followsMe) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
    }

    // Idempotent: unique (story_id, rep_id) — re-liking is a no-op.
    const { error } = await db
      .from("rep_story_likes")
      .insert({ story_id: storyId, rep_id: me });

    const isAlreadyLiked =
      error != null && (error.code === "23505" || /duplicate key/i.test(error.message ?? ""));

    if (error && !isAlreadyLiked) {
      Sentry.captureException(error, { extra: { repId: me, storyId } });
      return NextResponse.json({ error: "Failed to like" }, { status: 500 });
    }

    const likes = await fetchStoryLikesSingle(db, storyId, me);

    return NextResponse.json({
      data: {
        liked: true,
        like_count: likes.count,
        recent_likers: likes.recentLikers,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/[id]/like] POST error:", err);
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

    const { id: storyId } = await params;
    if (!UUID_RE.test(storyId)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const me = auth.rep.id;

    // Idempotent — deleting a row that doesn't exist still returns 200
    // with the current canonical state. Confirm story exists separately
    // so we 404 cleanly when the story is gone.
    const { data: story } = await db
      .from("rep_stories")
      .select("id, deleted_at")
      .eq("id", storyId)
      .maybeSingle();

    if (!story || (story as { deleted_at: string | null }).deleted_at) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const { error } = await db
      .from("rep_story_likes")
      .delete()
      .eq("story_id", storyId)
      .eq("rep_id", me);

    if (error) {
      Sentry.captureException(error, { extra: { repId: me, storyId } });
      return NextResponse.json({ error: "Failed to unlike" }, { status: 500 });
    }

    const likes = await fetchStoryLikesSingle(db, storyId, me);

    return NextResponse.json({
      data: {
        liked: false,
        like_count: likes.count,
        recent_likers: likes.recentLikers,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/[id]/like] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
