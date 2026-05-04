import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  STORY_SELECT,
  toStoryDTO,
  type AuthorRow,
  type StoryRow,
} from "@/lib/stories-mapper";
import { fetchStoryLikesSingle } from "@/lib/story-likes";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/stories/:id — Single story
 *   Side effect: inserts a (story, viewer) row into rep_story_views.
 *   Idempotent per viewer — re-opening never double-counts. The
 *   view_count trigger on that table increments the parent.
 *
 * DELETE /api/rep-portal/stories/:id — Author early-delete
 *   Soft delete — sets deleted_at. Feed filter drops it; view rows stay
 *   for analytics.
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

    const { data: rawStory } = await db
      .from("rep_stories")
      .select(STORY_SELECT + ", deleted_at")
      .eq("id", id)
      .maybeSingle();

    // Supabase's JS typings narrow .select() to a string-literal + concat
    // pattern that defeats the generic. Cast through unknown so the
    // deleted_at / full-row shape lines up.
    const story = rawStory as unknown as (StoryRow & { deleted_at: string | null }) | null;
    if (!story || story.deleted_at) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Expired? Hide from everyone except the author (they can still open
    // their own past stories from a future "My stories" screen).
    const isAuthor = story.author_rep_id === auth.rep.id;
    if (new Date(story.expires_at).getTime() < Date.now() && !isAuthor) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // followers-only visibility → mutual follow (or author)
    if (story.visibility === "followers" && !isAuthor) {
      const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", auth.rep.id)
          .eq("followee_id", story.author_rep_id)
          .maybeSingle(),
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", story.author_rep_id)
          .eq("followee_id", auth.rep.id)
          .maybeSingle(),
      ]);
      if (!iFollow || !followsMe) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
    }

    // Record the view — idempotent via unique (story_id, viewer_rep_id).
    // Authors don't count as a view of their own story.
    let viewedByMe = isAuthor;
    if (!isAuthor) {
      const { error: viewError } = await db
        .from("rep_story_views")
        .insert({ story_id: story.id, viewer_rep_id: auth.rep.id });
      const dup = viewError?.code === "23505";
      if (viewError && !dup) {
        Sentry.captureException(viewError, { level: "warning" });
      }
      viewedByMe = true;
    }

    // Re-read view_count after the insert so the DTO is fresh. Only reads
    // the one field — cheap.
    let refreshedViewCount = story.view_count;
    if (!isAuthor) {
      const { data: refreshed } = await db
        .from("rep_stories")
        .select("view_count")
        .eq("id", story.id)
        .maybeSingle();
      refreshedViewCount = (refreshed as { view_count?: number } | null)?.view_count ?? story.view_count;
    }

    // Author row for the DTO
    const { data: authorData } = await db
      .from("reps")
      .select("id, display_name, first_name, last_name, photo_url, level")
      .eq("id", story.author_rep_id)
      .maybeSingle();
    if (!authorData) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const likes = await fetchStoryLikesSingle(db, story.id, auth.rep.id);

    const dto = toStoryDTO(
      { ...story, view_count: refreshedViewCount } as StoryRow,
      authorData as AuthorRow,
      {
        viewerId: auth.rep.id,
        viewedByMe,
        likeCount: likes.count,
        isLikedByMe: likes.isLikedByMe,
        recentLikers: likes.recentLikers,
      }
    );

    return NextResponse.json({ data: dto });
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
