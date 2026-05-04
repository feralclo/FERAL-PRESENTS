/**
 * Suggestions orchestrator — assembles the four sections shown in the
 * iOS Spotify track picker:
 *
 *   1. recent   — this rep's own story track picks (last 30d)
 *   2. friends  — mutual-follow reps' picks (last 14d)
 *   3. team     — same-promoter teammates' picks (last 30d)
 *   4. trending — smart-mixed pool with affinity weighting
 *
 * Sections are deduped left-to-right (a track in `recent` won't reappear
 * in `friends`, etc). Empty sections are omitted from the response so
 * iOS can lay out only what's present.
 *
 * Impressions are logged for the trending section only — that's the one
 * we're pushing. Friends/team are social signal that should keep showing
 * even if the rep skips.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  smartMix,
  deriveAffinity,
  type PoolTrack,
  type RepImpression,
} from "@/lib/music/track-mix";

export type SectionKind = "recent" | "friends" | "team" | "trending";

export interface SuggestionTrack extends SpotifyTrack {
  /** Set on trending-section tracks added in the last 7 days. */
  is_fresh?: boolean;
}

export interface SuggestionSection {
  id: SectionKind;
  kind: SectionKind;
  title: string;
  subtitle?: string;
  tracks: SuggestionTrack[];
}

export interface SuggestionsResponse {
  sections: SuggestionSection[];
  generated_at: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const RECENT_WINDOW_DAYS = 30;
const FRIENDS_WINDOW_DAYS = 14;
const TEAM_WINDOW_DAYS = 30;
const RECENT_LIMIT = 12;
const FRIENDS_LIMIT = 12;
const TEAM_LIMIT = 12;
const TRENDING_LIMIT = 20;
const AFFINITY_PICK_HISTORY = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

interface StoryRow {
  spotify_track_id: string;
  spotify_track_title: string;
  spotify_track_artist: string;
  spotify_album_name: string | null;
  spotify_album_image_url: string | null;
  spotify_preview_url: string;
  spotify_external_url: string | null;
  spotify_duration_ms: number | null;
  spotify_artists: { id?: string; name?: string }[] | null;
  author_rep_id: string;
  created_at: string;
}

/** Convert a story snapshot row → SpotifyTrack DTO. */
function storyToTrack(row: StoryRow): SpotifyTrack {
  const artists =
    Array.isArray(row.spotify_artists) && row.spotify_artists.length > 0
      ? row.spotify_artists
          .filter((a) => a.id && a.name)
          .map((a) => ({ id: a.id as string, name: a.name as string }))
      : [
          {
            // Synthetic id for stories whose snapshot predates the artists[]
            // column. Never written back to Spotify; just satisfies the DTO.
            id: `legacy:${row.spotify_track_id}`,
            name: row.spotify_track_artist,
          },
        ];
  return {
    id: row.spotify_track_id,
    name: row.spotify_track_title,
    artists,
    album: {
      name: row.spotify_album_name ?? "",
      image_url: row.spotify_album_image_url,
    },
    preview_url: row.spotify_preview_url,
    duration_ms: row.spotify_duration_ms ?? 0,
    external_url:
      row.spotify_external_url ??
      `https://open.spotify.com/track/${row.spotify_track_id}`,
    isrc: null,
  };
}

/** Newest pick per track_id wins — collapses repeat picks to one entry. */
function dedupeStoriesByTrack(rows: StoryRow[]): StoryRow[] {
  const seen = new Map<string, StoryRow>();
  for (const row of rows) {
    const existing = seen.get(row.spotify_track_id);
    if (!existing || row.created_at > existing.created_at) {
      seen.set(row.spotify_track_id, row);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
}

// ─── Section builders ─────────────────────────────────────────────────────

async function loadRecent(
  db: SupabaseClient,
  repId: string
): Promise<StoryRow[]> {
  const { data, error } = await db
    .from("rep_stories")
    .select(
      "spotify_track_id, spotify_track_title, spotify_track_artist, spotify_album_name, spotify_album_image_url, spotify_preview_url, spotify_external_url, spotify_duration_ms, spotify_artists, author_rep_id, created_at"
    )
    .eq("author_rep_id", repId)
    .gte("created_at", isoDaysAgo(RECENT_WINDOW_DAYS))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

async function loadFriends(
  db: SupabaseClient,
  repId: string,
  blockedSet: Set<string>
): Promise<StoryRow[]> {
  // Mutual follow: rep follows X AND X follows rep.
  const { data: follows } = await db
    .from("rep_follows")
    .select("followee_id")
    .eq("follower_id", repId);
  const followeeIds = (follows ?? []).map((r) => r.followee_id as string);
  if (followeeIds.length === 0) return [];

  const { data: backFollows } = await db
    .from("rep_follows")
    .select("follower_id")
    .eq("followee_id", repId)
    .in("follower_id", followeeIds);
  const friendIds = (backFollows ?? [])
    .map((r) => r.follower_id as string)
    .filter((id) => !blockedSet.has(id));
  if (friendIds.length === 0) return [];

  const { data, error } = await db
    .from("rep_stories")
    .select(
      "spotify_track_id, spotify_track_title, spotify_track_artist, spotify_album_name, spotify_album_image_url, spotify_preview_url, spotify_external_url, spotify_duration_ms, spotify_artists, author_rep_id, created_at"
    )
    .in("author_rep_id", friendIds)
    .gte("created_at", isoDaysAgo(FRIENDS_WINDOW_DAYS))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return data ?? [];
}

async function loadTeam(
  db: SupabaseClient,
  repId: string,
  blockedSet: Set<string>
): Promise<StoryRow[]> {
  // Promoters this rep is on.
  const { data: myMemberships } = await db
    .from("rep_promoter_memberships")
    .select("promoter_id")
    .eq("rep_id", repId)
    .eq("status", "approved");
  const promoterIds = (myMemberships ?? []).map(
    (r) => r.promoter_id as string
  );
  if (promoterIds.length === 0) return [];

  // Other reps on the same promoters.
  const { data: teammates } = await db
    .from("rep_promoter_memberships")
    .select("rep_id")
    .in("promoter_id", promoterIds)
    .eq("status", "approved")
    .neq("rep_id", repId);
  const teammateIds = Array.from(
    new Set(
      (teammates ?? [])
        .map((r) => r.rep_id as string)
        .filter((id) => !blockedSet.has(id))
    )
  );
  if (teammateIds.length === 0) return [];

  const { data, error } = await db
    .from("rep_stories")
    .select(
      "spotify_track_id, spotify_track_title, spotify_track_artist, spotify_album_name, spotify_album_image_url, spotify_preview_url, spotify_external_url, spotify_duration_ms, spotify_artists, author_rep_id, created_at"
    )
    .in("author_rep_id", teammateIds)
    .gte("created_at", isoDaysAgo(TEAM_WINDOW_DAYS))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return data ?? [];
}

async function loadBlockedReps(
  db: SupabaseClient,
  repId: string
): Promise<Set<string>> {
  // Hide content in BOTH directions: reps this rep blocked, and reps who
  // blocked this rep. Same pattern as the rest of the platform.
  const { data: outgoing } = await db
    .from("rep_blocks")
    .select("blocked_rep_id")
    .eq("blocker_rep_id", repId);
  const { data: incoming } = await db
    .from("rep_blocks")
    .select("blocker_rep_id")
    .eq("blocked_rep_id", repId);
  const set = new Set<string>();
  for (const r of outgoing ?? []) set.add(r.blocked_rep_id as string);
  for (const r of incoming ?? []) set.add(r.blocker_rep_id as string);
  return set;
}

async function loadTrendingPool(db: SupabaseClient): Promise<PoolTrack[]> {
  const { data, error } = await db
    .from("trending_track_pool")
    .select(
      "playlist_id, track_id, position, added_at_spotify, first_seen_at, popularity, track_data"
    );
  if (error) throw error;
  return (data ?? []) as PoolTrack[];
}

async function loadImpressions(
  db: SupabaseClient,
  repId: string
): Promise<RepImpression[]> {
  const { data, error } = await db
    .from("rep_track_impressions")
    .select("track_id, count, last_shown_at")
    .eq("rep_id", repId);
  if (error) throw error;
  return (data ?? []) as RepImpression[];
}

async function logImpressions(
  db: SupabaseClient,
  repId: string,
  trackIds: string[]
): Promise<void> {
  if (trackIds.length === 0) return;
  // Bulk insert with ON CONFLICT to increment count + bump last_shown_at.
  // Supabase JS doesn't expose ON CONFLICT DO UPDATE directly via the
  // builder, so we use upsert + rely on the PK conflict path. To get
  // count++, we read existing counts in a single query and write back.
  const { data: existing } = await db
    .from("rep_track_impressions")
    .select("track_id, count")
    .eq("rep_id", repId)
    .in("track_id", trackIds);
  const existingMap = new Map<string, number>();
  for (const row of existing ?? []) {
    existingMap.set(row.track_id as string, row.count as number);
  }
  const nowIso = new Date().toISOString();
  const rows = trackIds.map((trackId) => ({
    rep_id: repId,
    track_id: trackId,
    count: (existingMap.get(trackId) ?? 0) + 1,
    last_shown_at: nowIso,
  }));
  await db.from("rep_track_impressions").upsert(rows, {
    onConflict: "rep_id,track_id",
    // first_shown_at preserved on existing rows because we don't touch it.
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────

export async function buildSuggestions(
  db: SupabaseClient,
  repId: string,
  options: { trendingLimit?: number } = {}
): Promise<SuggestionsResponse> {
  const trendingLimit = Math.max(
    1,
    Math.min(50, options.trendingLimit ?? TRENDING_LIMIT)
  );

  // Fetch in parallel — none of these depend on each other.
  const [recent, blockedSet, pool, impressions] = await Promise.all([
    loadRecent(db, repId),
    loadBlockedReps(db, repId),
    loadTrendingPool(db),
    loadImpressions(db, repId),
  ]);
  const [friends, team] = await Promise.all([
    loadFriends(db, repId, blockedSet),
    loadTeam(db, repId, blockedSet),
  ]);

  const sections: SuggestionSection[] = [];
  const usedTrackIds = new Set<string>();

  // 1. Recent — rep's own picks.
  const recentDeduped = dedupeStoriesByTrack(recent).slice(0, RECENT_LIMIT);
  if (recentDeduped.length > 0) {
    for (const r of recentDeduped) usedTrackIds.add(r.spotify_track_id);
    sections.push({
      id: "recent",
      kind: "recent",
      title: "Recently in your Stories",
      tracks: recentDeduped.map(storyToTrack),
    });
  }

  // 2. Friends — mutual follows' picks, deduped against recent.
  const friendsFiltered = dedupeStoriesByTrack(friends)
    .filter((r) => !usedTrackIds.has(r.spotify_track_id))
    .slice(0, FRIENDS_LIMIT);
  if (friendsFiltered.length > 0) {
    for (const r of friendsFiltered) usedTrackIds.add(r.spotify_track_id);
    sections.push({
      id: "friends",
      kind: "friends",
      title: "Friends are playing",
      subtitle: "Recently in their Stories",
      tracks: friendsFiltered.map(storyToTrack),
    });
  }

  // 3. Team — same-promoter teammates' picks, deduped.
  const teamFiltered = dedupeStoriesByTrack(team)
    .filter((r) => !usedTrackIds.has(r.spotify_track_id))
    .slice(0, TEAM_LIMIT);
  if (teamFiltered.length > 0) {
    for (const r of teamFiltered) usedTrackIds.add(r.spotify_track_id);
    sections.push({
      id: "team",
      kind: "team",
      title: "Your team is playing",
      subtitle: "Recently in their Stories",
      tracks: teamFiltered.map(storyToTrack),
    });
  }

  // 4. Trending — smart-mix from pool, deduped against everything above.
  if (pool.length > 0) {
    // Affinity uses the rep's last 30 picks. Pull a wider window than
    // RECENT_WINDOW_DAYS would give if RECENT_LIMIT capped it.
    const allRecentPicks = recent
      .slice(0, AFFINITY_PICK_HISTORY)
      .map((r) => r.spotify_track_id);
    const affinity = deriveAffinity(allRecentPicks, pool);

    // Hide pool tracks already used in higher sections by passing them as
    // pre-impressed (count = drop threshold so they're filtered).
    const syntheticImpressions: RepImpression[] = [
      ...impressions,
      ...Array.from(usedTrackIds).map((track_id) => ({
        track_id,
        count: 99,
        last_shown_at: new Date().toISOString(),
      })),
    ];

    const ranked = smartMix(pool, affinity, syntheticImpressions, {
      limit: trendingLimit,
    });

    if (ranked.length > 0) {
      const trendingTracks = ranked.map((r) => ({
        ...r.track,
        is_fresh: r.is_fresh || undefined,
      }));
      sections.push({
        id: "trending",
        kind: "trending",
        title: "For you",
        subtitle: "Fresh in the scene",
        tracks: trendingTracks,
      });

      // Log impressions only for trending — see file header for rationale.
      // Fire-and-forget; we don't want a slow write to block the response.
      void logImpressions(db, repId, ranked.map((r) => r.track.id)).catch(() => {
        // Best-effort. Sentry already wraps the route handler.
      });
    }
  }

  return {
    sections,
    generated_at: new Date().toISOString(),
  };
}
