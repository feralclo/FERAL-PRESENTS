import type { SupabaseClient } from "@supabase/supabase-js";
import { toStoryLikerDTO, type AuthorRow, type StoryLikerDTO } from "@/lib/stories-mapper";

/**
 * Helpers for reading rep_story_likes rows in the shape the iOS client
 * expects on every StoryDTO.
 *
 * Three things hang off a story for the cluster + half-sheet UX:
 *   - total like count
 *   - whether the viewer has liked it
 *   - up to 3 most recent likers (avatar cluster)
 *
 * Computed once per request via batch queries — feed/list endpoints would
 * otherwise hit N+1 round trips.
 */

export const RECENT_LIKERS_CAP = 3;

export interface StoryLikesBatch {
  /** story_id → total like count */
  countByStory: Map<string, number>;
  /** story_ids the viewer has liked */
  likedByMe: Set<string>;
  /** story_id → up to RECENT_LIKERS_CAP likers, newest first */
  recentByStory: Map<string, StoryLikerDTO[]>;
}

type Db = SupabaseClient;

/**
 * Batch-load like data for a set of stories.
 *
 * Single round-trip per facet:
 *   - all like rows in the set (for count + recent-likers ordering)
 *   - viewer's like rows in the set
 *   - reps metadata for likers we need to render in the avatar cluster
 *
 * Counts are computed in memory rather than via a `count: exact` per
 * story, since we already need the per-row data to pick the 3 newest
 * likers.
 */
export async function fetchStoryLikesBatch(
  db: Db,
  storyIds: string[],
  viewerId: string
): Promise<StoryLikesBatch> {
  if (storyIds.length === 0) {
    return {
      countByStory: new Map(),
      likedByMe: new Set(),
      recentByStory: new Map(),
    };
  }

  const [allLikesRes, myLikesRes] = await Promise.all([
    db
      .from("rep_story_likes")
      .select("story_id, rep_id, created_at")
      .in("story_id", storyIds)
      .order("created_at", { ascending: false }),
    db
      .from("rep_story_likes")
      .select("story_id")
      .eq("rep_id", viewerId)
      .in("story_id", storyIds),
  ]);

  type LikeRow = { story_id: string; rep_id: string; created_at: string };
  const allLikes = (allLikesRes.data ?? []) as LikeRow[];

  const countByStory = new Map<string, number>();
  // Newest-first: rows arrive ordered by created_at DESC, so the first
  // RECENT_LIKERS_CAP per story are the ones we want.
  const recentRepIdsByStory = new Map<string, string[]>();
  const allRepIds = new Set<string>();

  for (const row of allLikes) {
    countByStory.set(row.story_id, (countByStory.get(row.story_id) ?? 0) + 1);
    const recents = recentRepIdsByStory.get(row.story_id) ?? [];
    if (recents.length < RECENT_LIKERS_CAP) {
      recents.push(row.rep_id);
      recentRepIdsByStory.set(row.story_id, recents);
      allRepIds.add(row.rep_id);
    }
  }

  // Hydrate the (small) set of rep ids needed for the avatar clusters.
  let repsById = new Map<string, AuthorRow>();
  if (allRepIds.size > 0) {
    const { data: reps } = await db
      .from("reps")
      .select("id, display_name, first_name, last_name, photo_url, level, status")
      .in("id", [...allRepIds]);
    for (const r of (reps ?? []) as Array<AuthorRow & { status: string }>) {
      // Soft-deleted reps are scrubbed; skip them so we never render a
      // ghost avatar in the cluster.
      if (r.status === "deleted") continue;
      repsById.set(r.id, r);
    }
  }

  const recentByStory = new Map<string, StoryLikerDTO[]>();
  for (const [storyId, repIds] of recentRepIdsByStory) {
    const dtos: StoryLikerDTO[] = [];
    for (const rid of repIds) {
      const rep = repsById.get(rid);
      if (rep) dtos.push(toStoryLikerDTO(rep));
    }
    recentByStory.set(storyId, dtos);
  }

  const likedByMe = new Set(
    ((myLikesRes.data ?? []) as Array<{ story_id: string }>).map((r) => r.story_id)
  );

  return { countByStory, likedByMe, recentByStory };
}

/**
 * Single-story variant. Used by POST/DELETE /stories/:id/like, where
 * we need to return the canonical post-mutation state and only one
 * story is in flight.
 */
export async function fetchStoryLikesSingle(
  db: Db,
  storyId: string,
  viewerId: string
): Promise<{
  count: number;
  isLikedByMe: boolean;
  recentLikers: StoryLikerDTO[];
}> {
  const batch = await fetchStoryLikesBatch(db, [storyId], viewerId);
  return {
    count: batch.countByStory.get(storyId) ?? 0,
    isLikedByMe: batch.likedByMe.has(storyId),
    recentLikers: batch.recentByStory.get(storyId) ?? [],
  };
}
