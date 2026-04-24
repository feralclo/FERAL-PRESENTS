import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  STORY_SELECT,
  toStoryDTO,
  type AuthorRow,
  type StoryRow,
} from "@/lib/stories-mapper";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/reps/:id/stories
 *
 * Currently-active stories for a specific rep, oldest → newest. Used by
 * the viewer flow: tap avatar on the home rail → swipe through this
 * rep's stories in playback order.
 *
 * Visibility rules match the feed:
 *   - public stories visible to any authenticated rep
 *   - followers-only stories visible only to mutual follows (or the author)
 *
 * Response: { data: StoryDTO[] }
 *
 * 404 when the rep doesn't exist / is deleted. Empty array (200) when
 * the rep has no active stories — iOS can render "no stories yet".
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

    // Verify the target rep exists and isn't deleted
    const { data: author } = await db
      .from("reps")
      .select("id, display_name, first_name, last_name, photo_url, level, status")
      .eq("id", id)
      .maybeSingle();
    if (!author || (author as { status: string }).status === "deleted") {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    const me = auth.rep.id;
    const isSelf = id === me;

    // Check mutual follow for the followers-only visibility gate. Skip
    // entirely when the viewer is the author (they see their own
    // followers-only stories).
    let isMutual = false;
    if (!isSelf) {
      const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", me)
          .eq("followee_id", id)
          .maybeSingle(),
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", id)
          .eq("followee_id", me)
          .maybeSingle(),
      ]);
      isMutual = !!iFollow && !!followsMe;
    }

    const now = new Date().toISOString();
    const { data: rawStories, error } = await db
      .from("rep_stories")
      .select(STORY_SELECT)
      .eq("author_rep_id", id)
      .is("deleted_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: true });

    if (error) {
      Sentry.captureException(error, { extra: { repId: me, targetId: id } });
      return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
    }

    const stories = (rawStories ?? []) as StoryRow[];
    const visible = stories.filter((s) => {
      if (isSelf) return true;
      if (s.visibility === "followers" && !isMutual) return false;
      return true;
    });

    if (visible.length === 0) return NextResponse.json({ data: [] });

    // Batch-read view state so we can mark each story accordingly.
    const { data: viewsData } = await db
      .from("rep_story_views")
      .select("story_id")
      .eq("viewer_rep_id", me)
      .in(
        "story_id",
        visible.map((s) => s.id)
      );
    const viewedSet = new Set(
      ((viewsData ?? []) as Array<{ story_id: string }>).map((v) => v.story_id)
    );

    const dtos = visible.map((row) =>
      toStoryDTO(row, author as AuthorRow, {
        viewerId: me,
        viewedByMe: isSelf || viewedSet.has(row.id),
      })
    );

    return NextResponse.json({ data: dtos });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reps/[id]/stories] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
