import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  STORY_SELECT,
  toStoryDTO,
  toStoryAuthor,
  type AuthorRow,
  type StoryRow,
} from "@/lib/stories-mapper";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/stories/feed
 *
 * Active (not expired, not deleted) stories the viewer is allowed to see:
 *   - stories from reps the viewer follows one-way (public)
 *   - stories from reps the viewer mutual-follows (public + followers-only)
 *   - stories from reps on promoters the viewer follows
 *   - the viewer's own stories (always)
 *
 * Grouped by author — iOS renders an Instagram-style row of avatars, tap
 * an author, swipe through their active stories in order.
 *
 * Story DTO shape lives in lib/stories-mapper.ts; any field change there
 * automatically flows through here, /:id, and /reps/:id/stories.
 */

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const me = auth.rep.id;
    const now = new Date().toISOString();

    // 1. Resolve who the viewer follows (reps + promoters)
    const [outgoingFollowsResult, incomingFollowsResult, promoterFollowsResult] = await Promise.all([
      db.from("rep_follows").select("followee_id").eq("follower_id", me),
      db.from("rep_follows").select("follower_id").eq("followee_id", me),
      db.from("rep_promoter_follows").select("promoter_id").eq("rep_id", me),
    ]);

    const iFollowReps = new Set(
      ((outgoingFollowsResult.data ?? []) as Array<{ followee_id: string }>).map((r) => r.followee_id)
    );
    const repsFollowMe = new Set(
      ((incomingFollowsResult.data ?? []) as Array<{ follower_id: string }>).map((r) => r.follower_id)
    );
    const iFollowPromoters = new Set(
      ((promoterFollowsResult.data ?? []) as Array<{ promoter_id: string }>).map((r) => r.promoter_id)
    );

    const mutualReps = new Set<string>();
    for (const id of iFollowReps) if (repsFollowMe.has(id)) mutualReps.add(id);

    // 2. Candidate author pool = reps I follow ∪ reps on promoters I follow ∪ me
    const authorPool = new Set<string>([...iFollowReps, me]);
    if (iFollowPromoters.size > 0) {
      const { data: memberships } = await db
        .from("rep_promoter_memberships")
        .select("rep_id")
        .in("promoter_id", [...iFollowPromoters])
        .eq("status", "approved");
      for (const m of (memberships ?? []) as Array<{ rep_id: string }>) {
        authorPool.add(m.rep_id);
      }
    }

    if (authorPool.size === 0) return NextResponse.json({ data: [] });

    // 3. Active stories from the pool
    const { data: storiesRaw, error } = await db
      .from("rep_stories")
      .select(STORY_SELECT)
      .in("author_rep_id", [...authorPool])
      .is("deleted_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false });

    if (error) {
      Sentry.captureException(error, { extra: { me } });
      return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
    }

    // Filter followers-only stories from reps who aren't mutuals.
    const visible = ((storiesRaw ?? []) as StoryRow[]).filter((s) => {
      if (s.author_rep_id === me) return true;
      if (s.visibility === "followers" && !mutualReps.has(s.author_rep_id)) return false;
      return true;
    });

    if (visible.length === 0) return NextResponse.json({ data: [] });

    // 4. Which stories has the viewer already seen?
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

    // 5. Author metadata
    const authorIds = [...new Set(visible.map((s) => s.author_rep_id))];
    const { data: authorsData } = await db
      .from("reps")
      .select("id, display_name, first_name, last_name, photo_url, level")
      .in("id", authorIds);
    const authorById = new Map<string, AuthorRow>(
      ((authorsData ?? []) as AuthorRow[]).map((a) => [a.id, a])
    );

    // 6. Build author-grouped output
    type Group = {
      author: ReturnType<typeof toStoryAuthor>;
      stories: ReturnType<typeof toStoryDTO>[];
      has_unviewed: boolean;
      newest_at: string;
    };
    const groups = new Map<string, Group>();

    for (const row of visible) {
      const author = authorById.get(row.author_rep_id);
      if (!author) continue;
      const viewedByMe = row.author_rep_id === me || viewedSet.has(row.id);
      const dto = toStoryDTO(row, author, { viewerId: me, viewedByMe });
      const group =
        groups.get(row.author_rep_id) ??
        {
          author: toStoryAuthor(author),
          stories: [],
          has_unviewed: false,
          newest_at: row.created_at,
        };
      group.stories.push(dto);
      if (!viewedByMe) group.has_unviewed = true;
      if (row.created_at > group.newest_at) group.newest_at = row.created_at;
      groups.set(row.author_rep_id, group);
    }

    // Sort groups: viewer first, then groups with unviewed stories, then by newest.
    const grouped = [...groups.values()].sort((a, b) => {
      if (a.author.id === me && b.author.id !== me) return -1;
      if (b.author.id === me && a.author.id !== me) return 1;
      if (a.has_unviewed !== b.has_unviewed) return a.has_unviewed ? -1 : 1;
      return b.newest_at.localeCompare(a.newest_at);
    });

    // Stories within a group render oldest → newest so playback is chronological.
    for (const g of grouped) {
      g.stories.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    return NextResponse.json({ data: grouped });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/feed] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
