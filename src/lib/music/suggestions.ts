/**
 * Suggestions orchestrator — assembles the sections shown in the iOS
 * Spotify track picker.
 *
 * Order in the response:
 *   1. trending  (For You — affinity-weighted mix from all playlists)
 *   2. genre × N (Hard Techno / Schranz / Hard Dance — browse-by-mood)
 *   3. recent    (this rep's own picks, last 30d)
 *   4. friends   (mutual-follow reps' picks, last 14d)
 *   5. team      (same-promoter reps' picks, last 30d)
 *
 * Empty sections are omitted so iOS lays out only what's present.
 *
 * Dedup priority (most-personal wins):
 *   recent > friends > team > For You / genre sections
 *
 * For You and genre sections may share tracks — different framing
 * ("recommended for you" vs "browsing Hard Techno"), so duplication is
 * intentional. They DO dedup against the social sections above so a
 * track you just played in your own story doesn't reappear as a
 * suggestion.
 *
 * Impressions are logged for For You + genre tracks. Friends/team are
 * social signal, not us pushing — no impression count needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  smartMix,
  deriveAffinity,
  type PoolTrack,
  type RepImpression,
} from "@/lib/music/track-mix";
import { genreSectionPlaylists } from "@/lib/music/trending-playlists";

export type SectionKind = "recent" | "friends" | "team" | "trending" | "genre";

export interface SuggestionTrack extends SpotifyTrack {
  /** Curator added this track to the playlist within the last 7 days. */
  is_fresh?: boolean;
  /** Track's album was actually released within the last 30 days. The
   *  "real new" signal — separate from is_fresh which is "freshly curated". */
  is_new_release?: boolean;
}

export interface SuggestionSection {
  id: string;
  kind: SectionKind;
  title: string;
  subtitle?: string;
  /** Subgenres covered by this genre section. Empty for non-genre sections. */
  subgenres?: string[];
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
const GENRE_SECTION_LIMIT = 15;
const AFFINITY_PICK_HISTORY = 30;
/** Tracks released within this many days get is_new_release: true. */
const NEW_RELEASE_WINDOW_DAYS = 30;

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

/** Compute is_new_release from a track's release_date. Spotify's
 *  release_date_precision can be "day" / "month" / "year" — we
 *  conservatively treat anything below day-level precision as not-new
 *  (a 2024-12 release shouldn't claim "new" in March 2026 just because
 *  it parses to Dec 1, 2024). */
function isNewRelease(releaseDate: string | undefined, now: Date): boolean {
  if (!releaseDate) return false;
  // Only YYYY-MM-DD format is precise enough for the new-release signal.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return false;
  const released = new Date(releaseDate + "T00:00:00Z");
  if (Number.isNaN(released.getTime())) return false;
  const ageMs = now.getTime() - released.getTime();
  const ageDays = ageMs / 86_400_000;
  return ageDays >= 0 && ageDays <= NEW_RELEASE_WINDOW_DAYS;
}

// ─── DB loaders ───────────────────────────────────────────────────────────

const STORY_SELECT =
  "spotify_track_id, spotify_track_title, spotify_track_artist, spotify_album_name, spotify_album_image_url, spotify_preview_url, spotify_external_url, spotify_duration_ms, spotify_artists, author_rep_id, created_at";

async function loadRecent(
  db: SupabaseClient,
  repId: string
): Promise<StoryRow[]> {
  const { data, error } = await db
    .from("rep_stories")
    .select(STORY_SELECT)
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
    .select(STORY_SELECT)
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
  const { data: myMemberships } = await db
    .from("rep_promoter_memberships")
    .select("promoter_id")
    .eq("rep_id", repId)
    .eq("status", "approved");
  const promoterIds = (myMemberships ?? []).map(
    (r) => r.promoter_id as string
  );
  if (promoterIds.length === 0) return [];

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
    .select(STORY_SELECT)
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
  });
}

// ─── Section builders ─────────────────────────────────────────────────────

interface RankedPicks {
  trackIds: string[];
  tracks: SuggestionTrack[];
}

/** Run smartMix over a pool subset and convert to SuggestionTracks with
 *  is_fresh + is_new_release flags. */
function buildRankedSection(
  pool: PoolTrack[],
  affinity: Record<string, number>,
  syntheticImpressions: RepImpression[],
  limit: number,
  now: Date
): RankedPicks {
  if (pool.length === 0) return { trackIds: [], tracks: [] };
  const ranked = smartMix(pool, affinity, syntheticImpressions, {
    limit,
    now,
  });
  const tracks: SuggestionTrack[] = ranked.map((r) => {
    const t: SuggestionTrack = { ...r.track };
    if (r.is_fresh) t.is_fresh = true;
    if (isNewRelease(r.track.release_date, now)) t.is_new_release = true;
    return t;
  });
  return { trackIds: ranked.map((r) => r.track.id), tracks };
}

// ─── Main entry point ─────────────────────────────────────────────────────

export async function buildSuggestions(
  db: SupabaseClient,
  repId: string,
  options: { trendingLimit?: number; now?: Date } = {}
): Promise<SuggestionsResponse> {
  const trendingLimit = Math.max(
    1,
    Math.min(50, options.trendingLimit ?? TRENDING_LIMIT)
  );
  const now = options.now ?? new Date();

  // Fetch in parallel.
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

  // Resolve social sections first so we know which tracks to dedup out
  // of For You + genre sections (most-personal wins).
  const recentDeduped = dedupeStoriesByTrack(recent).slice(0, RECENT_LIMIT);
  const recentIds = new Set(recentDeduped.map((r) => r.spotify_track_id));

  const friendsFiltered = dedupeStoriesByTrack(friends)
    .filter((r) => !recentIds.has(r.spotify_track_id))
    .slice(0, FRIENDS_LIMIT);
  const socialIdsAfterFriends = new Set(recentIds);
  for (const r of friendsFiltered) {
    socialIdsAfterFriends.add(r.spotify_track_id);
  }

  const teamFiltered = dedupeStoriesByTrack(team)
    .filter((r) => !socialIdsAfterFriends.has(r.spotify_track_id))
    .slice(0, TEAM_LIMIT);
  const socialIds = new Set(socialIdsAfterFriends);
  for (const r of teamFiltered) socialIds.add(r.spotify_track_id);

  // Pre-impressed list for For You + genre sections: pool tracks that are
  // already in social sections get count=99 to drop them from smartMix.
  const baseSyntheticImpressions: RepImpression[] = [
    ...impressions,
    ...Array.from(socialIds).map((track_id) => ({
      track_id,
      count: 99,
      last_shown_at: now.toISOString(),
    })),
  ];

  const sections: SuggestionSection[] = [];
  const trackIdsLogged = new Set<string>();

  // 1. For You — affinity-weighted mix across all playlists in the pool.
  if (pool.length > 0) {
    const allRecentPicks = recent
      .slice(0, AFFINITY_PICK_HISTORY)
      .map((r) => r.spotify_track_id);
    const affinity = deriveAffinity(allRecentPicks, pool);
    const picks = buildRankedSection(
      pool,
      affinity,
      baseSyntheticImpressions,
      trendingLimit,
      now
    );
    if (picks.tracks.length > 0) {
      sections.push({
        id: "trending",
        kind: "trending",
        title: "For you",
        subtitle: "Fresh in the scene",
        tracks: picks.tracks,
      });
      for (const id of picks.trackIds) trackIdsLogged.add(id);
    }
  }

  // 2. Genre sections — one per playlist with section_label, in display_order.
  //    Each section uses ONLY that playlist's tracks (no cross-playlist mix),
  //    no affinity weighting, AND no impression decay. Genre rows are
  //    browse-by-mood, not personalized: a rep should see the top-ranked
  //    schranz tracks every time they open the picker, not have them
  //    vanish after 5 unselected opens. Decay belongs to For You only,
  //    where it makes sense (the personalized hero needs to rotate).
  //
  //    We DO still pass the social-section block so a track they just
  //    used in their own story doesn't reappear here — but normal
  //    impression rotation is disabled. Genre track IDs are also NOT
  //    added to trackIdsLogged so they never count toward the decay
  //    threshold either.
  const genreImpressions: RepImpression[] = Array.from(socialIds).map(
    (track_id) => ({
      track_id,
      count: 99,
      last_shown_at: now.toISOString(),
    })
  );
  for (const cfg of genreSectionPlaylists()) {
    const subset = pool.filter((p) => p.playlist_id === cfg.id);
    if (subset.length === 0) continue;
    const picks = buildRankedSection(
      subset,
      {}, // no affinity — pure quality ranking within this genre
      genreImpressions,
      GENRE_SECTION_LIMIT,
      now
    );
    if (picks.tracks.length === 0) continue;
    sections.push({
      id: `genre-${cfg.genre_label}`,
      kind: "genre",
      title: cfg.section_label ?? cfg.genre_label,
      subtitle:
        cfg.subgenres.length > 0 ? cfg.subgenres.join(" · ") : undefined,
      subgenres: cfg.subgenres.length > 0 ? cfg.subgenres : undefined,
      tracks: picks.tracks,
    });
    // Intentionally NOT added to trackIdsLogged — see comment above.
  }

  // 3. Recent — rep's own past Story picks.
  if (recentDeduped.length > 0) {
    sections.push({
      id: "recent",
      kind: "recent",
      title: "Recently in your Stories",
      tracks: recentDeduped.map(storyToTrack),
    });
  }

  // 4. Friends.
  if (friendsFiltered.length > 0) {
    sections.push({
      id: "friends",
      kind: "friends",
      title: "Friends are playing",
      subtitle: "Recently in their Stories",
      tracks: friendsFiltered.map(storyToTrack),
    });
  }

  // 5. Team.
  if (teamFiltered.length > 0) {
    sections.push({
      id: "team",
      kind: "team",
      title: "Your team is playing",
      subtitle: "Recently in their Stories",
      tracks: teamFiltered.map(storyToTrack),
    });
  }

  // Log impressions for For You only (genre tracks deliberately excluded —
  // see the genreImpressions comment above). Fire-and-forget so a slow
  // write doesn't stall the response.
  if (trackIdsLogged.size > 0) {
    void logImpressions(db, repId, Array.from(trackIdsLogged)).catch(() => {
      // Best-effort. Sentry already wraps the route handler.
    });
  }

  return {
    sections,
    generated_at: now.toISOString(),
  };
}
