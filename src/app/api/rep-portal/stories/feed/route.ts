import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/stories/feed
 *
 * Active (not expired, not deleted) stories the viewer is allowed to see:
 *   - stories from reps the viewer mutual-follows (friends) — always
 *   - public stories from reps the viewer follows one-way
 *   - stories scoped to a promoter the viewer follows
 *   - the viewer's own stories (always)
 *
 * Followers-only stories are only visible to reps who mutually follow the author.
 *
 * Grouped by author — clients render an Instagram-style row of circles,
 * tap opens the author's story reel.
 *
 * Response:
 *   {
 *     data: [{
 *       author: { id, display_name, photo_url, level },
 *       stories: [{ id, media_url, media_kind, caption, spotify: {...},
 *                   event_id, promoter_id, expires_at, created_at,
 *                   viewed_by_me, view_count, is_mine }],
 *       has_unviewed: bool,
 *       newest_at: ISO8601
 *     }]
 *   }
 */

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const me = auth.rep.id;
    const now = new Date().toISOString();

    // 1. Who does the viewer follow — reps + promoters
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

    // Mutual set — friends (bi-directional follow)
    const mutualReps = new Set<string>();
    for (const id of iFollowReps) if (repsFollowMe.has(id)) mutualReps.add(id);

    // 2. Candidate author pool: reps I follow (one or two way) + reps on
    // promoters I follow + me.
    const authorPool = new Set<string>([...iFollowReps, me]);
    // Always add reps on promoters I follow (widens feed to team-mates).
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

    if (authorPool.size === 0) {
      return NextResponse.json({ data: [] });
    }

    // 3. Pull active stories from the pool in one query.
    const { data: storiesRaw, error } = await db
      .from("rep_stories")
      .select(
        "id, author_rep_id, media_url, media_kind, media_width, media_height, duration_ms, caption, spotify_track_id, spotify_preview_url, spotify_track_title, spotify_track_artist, spotify_album_image_url, spotify_clip_start_ms, spotify_clip_length_ms, event_id, promoter_id, visibility, view_count, expires_at, created_at"
      )
      .in("author_rep_id", [...authorPool])
      .is("deleted_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false });

    if (error) {
      Sentry.captureException(error, { extra: { me } });
      return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
    }

    type StoryRow = {
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
    };

    // Filter followers-only stories from reps who aren't mutuals.
    const visible = ((storiesRaw ?? []) as StoryRow[]).filter((s) => {
      if (s.author_rep_id === me) return true;
      if (s.visibility === "followers" && !mutualReps.has(s.author_rep_id)) return false;
      return true;
    });

    if (visible.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 4. Which of these has the viewer already seen?
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

    // 5. Resolve author metadata
    const authorIds = [...new Set(visible.map((s) => s.author_rep_id))];
    const { data: authorsData } = await db
      .from("reps")
      .select("id, display_name, first_name, last_name, photo_url, level")
      .in("id", authorIds);
    type Author = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      photo_url: string | null;
      level: number | null;
    };
    const authorById = new Map<string, Author>(
      ((authorsData ?? []) as Author[]).map((a) => [a.id, a])
    );

    // 6. Group by author
    type GroupedStory = {
      id: string;
      media_url: string;
      media_kind: "image" | "video";
      media_width: number | null;
      media_height: number | null;
      duration_ms: number | null;
      caption: string | null;
      spotify: {
        track_id: string;
        preview_url: string;
        track_title: string;
        track_artist: string;
        album_image_url: string | null;
        clip_start_ms: number;
        clip_length_ms: number;
      };
      event_id: string | null;
      promoter_id: string | null;
      visibility: string;
      view_count: number;
      viewed_by_me: boolean;
      is_mine: boolean;
      expires_at: string;
      created_at: string;
    };

    const groups = new Map<
      string,
      { author: Author; stories: GroupedStory[]; hasUnviewed: boolean; newestAt: string }
    >();

    for (const s of visible) {
      const author = authorById.get(s.author_rep_id);
      if (!author) continue;
      const group = groups.get(s.author_rep_id) ?? {
        author,
        stories: [] as GroupedStory[],
        hasUnviewed: false,
        newestAt: s.created_at,
      };
      const isMine = s.author_rep_id === me;
      const viewedByMe = isMine || viewedSet.has(s.id);
      if (!viewedByMe) group.hasUnviewed = true;
      if (s.created_at > group.newestAt) group.newestAt = s.created_at;
      group.stories.push({
        id: s.id,
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
        view_count: s.view_count,
        viewed_by_me: viewedByMe,
        is_mine: isMine,
        expires_at: s.expires_at,
        created_at: s.created_at,
      });
      groups.set(s.author_rep_id, group);
    }

    // Sort: viewer's own stories first, then groups with unviewed stories,
    // then by newest story desc.
    const grouped = [...groups.values()].sort((a, b) => {
      if (a.author.id === me && b.author.id !== me) return -1;
      if (b.author.id === me && a.author.id !== me) return 1;
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
      return b.newestAt.localeCompare(a.newestAt);
    });

    return NextResponse.json({
      data: grouped.map((g) => ({
        author: {
          id: g.author.id,
          display_name: g.author.display_name,
          first_name: g.author.first_name,
          last_name: g.author.last_name,
          photo_url: g.author.photo_url,
          level: g.author.level ?? 1,
        },
        // Author's stories are returned oldest→newest so the client can
        // autoplay in chronological order.
        stories: g.stories.sort((a, b) => a.created_at.localeCompare(b.created_at)),
        has_unviewed: g.hasUnviewed,
        newest_at: g.newestAt,
      })),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/feed] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
