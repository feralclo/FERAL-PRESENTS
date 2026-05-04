/**
 * Playlist refresh logic — pulls each configured Spotify playlist, diffs
 * against what we have stored, and updates `trending_track_pool` +
 * `trending_playlist_snapshots` accordingly.
 *
 * Called by:
 *   - /api/cron/spotify-trending-refresh (every 6h via vercel.json)
 *   - manually by maintainers when adding a new playlist (the cron will
 *     pick it up on the next tick anyway, so this is rare).
 *
 * Key invariants:
 *   - `first_seen_at` is preserved across refreshes — only set on insert.
 *     This keeps the freshness signal intact even when Spotify reorders
 *     a track (Spotify reorders bump snapshot_id but `added_at` stays put).
 *   - When a playlist is removed from the config, its rows in
 *     trending_track_pool are deleted on the next cron run (purgeStale).
 *   - When a track is removed from a playlist, its row for THAT playlist
 *     is deleted; if it still exists in another playlist, the other row
 *     survives. Cross-playlist boost continues to work correctly.
 */

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPlaylistMeta,
  getPlaylistTracks,
  isConfigured as isSpotifyConfigured,
} from "@/lib/spotify/client";
import {
  TRENDING_PLAYLISTS,
  trendingPlaylistIds,
} from "@/lib/music/trending-playlists";

export interface RefreshResult {
  playlist_id: string;
  status: "skipped_unchanged" | "refreshed" | "missing" | "error";
  tracks_added?: number;
  tracks_removed?: number;
  tracks_total?: number;
  error?: string;
}

interface PoolRow {
  playlist_id: string;
  track_id: string;
}

/**
 * Refresh a single playlist. Skips the heavy fetch when the snapshot_id
 * matches what we already have stored (Spotify hasn't changed anything).
 */
export async function refreshPlaylist(
  db: SupabaseClient,
  playlistId: string
): Promise<RefreshResult> {
  if (!isSpotifyConfigured()) {
    return {
      playlist_id: playlistId,
      status: "error",
      error: "spotify_unconfigured",
    };
  }

  let meta;
  try {
    meta = await getPlaylistMeta(playlistId);
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      extra: { step: "refreshPlaylist:getPlaylistMeta", playlistId },
    });
    return {
      playlist_id: playlistId,
      status: "error",
      error: err instanceof Error ? err.message.slice(0, 200) : "meta_fetch_failed",
    };
  }

  if (!meta) {
    return { playlist_id: playlistId, status: "missing" };
  }

  // Cheap path: snapshot unchanged, just bump last_refreshed_at and exit.
  const { data: existingSnapshot } = await db
    .from("trending_playlist_snapshots")
    .select("snapshot_id")
    .eq("playlist_id", playlistId)
    .maybeSingle();

  if (
    existingSnapshot?.snapshot_id &&
    existingSnapshot.snapshot_id === meta.snapshot_id
  ) {
    await db
      .from("trending_playlist_snapshots")
      .update({
        last_refreshed_at: new Date().toISOString(),
        followers: meta.followers,
        total_tracks: meta.total_tracks,
        spotify_name: meta.name,
      })
      .eq("playlist_id", playlistId);
    return {
      playlist_id: playlistId,
      status: "skipped_unchanged",
      tracks_total: meta.total_tracks,
    };
  }

  // Heavy path: fetch all tracks and diff.
  let items;
  try {
    items = await getPlaylistTracks(playlistId, { maxTracks: 200 });
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      extra: { step: "refreshPlaylist:getPlaylistTracks", playlistId },
    });
    return {
      playlist_id: playlistId,
      status: "error",
      error: err instanceof Error ? err.message.slice(0, 200) : "tracks_fetch_failed",
    };
  }

  // Load existing track ids for this playlist to compute the diff.
  const { data: existingRows } = await db
    .from("trending_track_pool")
    .select("track_id")
    .eq("playlist_id", playlistId);
  const existingIds = new Set((existingRows ?? []).map((r) => r.track_id));
  const incomingIds = new Set(items.map((i) => i.track.id));

  const toRemove: string[] = [];
  for (const id of existingIds) {
    if (!incomingIds.has(id)) toRemove.push(id);
  }

  // Upsert all incoming tracks. `first_seen_at` only gets a default value
  // on insert; for existing rows we let the DB keep the original value
  // by not including it in the upsert payload.
  // Strategy: do two passes. First, upsert NEW tracks with first_seen_at.
  // Second, update EXISTING tracks without touching first_seen_at.
  const nowIso = new Date().toISOString();

  const newTracks = items.filter((i) => !existingIds.has(i.track.id));
  const updateTracks = items.filter((i) => existingIds.has(i.track.id));

  if (newTracks.length > 0) {
    const insertRows = newTracks.map((i) => ({
      playlist_id: playlistId,
      track_id: i.track.id,
      position: i.position,
      added_at_spotify: i.added_at,
      first_seen_at: nowIso,
      popularity: i.popularity,
      track_data: i.track,
      refreshed_at: nowIso,
    }));
    const { error } = await db
      .from("trending_track_pool")
      .insert(insertRows);
    if (error) {
      Sentry.captureException(error, {
        level: "warning",
        extra: { step: "refreshPlaylist:insert", playlistId, count: insertRows.length },
      });
    }
  }

  if (updateTracks.length > 0) {
    // Update one-at-a-time; counts here are tiny (≤200) and Postgres
    // handles 200 row updates in well under the cron budget.
    for (const i of updateTracks) {
      await db
        .from("trending_track_pool")
        .update({
          position: i.position,
          added_at_spotify: i.added_at,
          popularity: i.popularity,
          track_data: i.track,
          refreshed_at: nowIso,
        })
        .eq("playlist_id", playlistId)
        .eq("track_id", i.track.id);
    }
  }

  if (toRemove.length > 0) {
    const { error } = await db
      .from("trending_track_pool")
      .delete()
      .eq("playlist_id", playlistId)
      .in("track_id", toRemove);
    if (error) {
      Sentry.captureException(error, {
        level: "warning",
        extra: { step: "refreshPlaylist:delete", playlistId, count: toRemove.length },
      });
    }
  }

  await db.from("trending_playlist_snapshots").upsert({
    playlist_id: playlistId,
    snapshot_id: meta.snapshot_id,
    spotify_name: meta.name,
    followers: meta.followers,
    total_tracks: meta.total_tracks,
    last_refreshed_at: nowIso,
  });

  return {
    playlist_id: playlistId,
    status: "refreshed",
    tracks_added: newTracks.length,
    tracks_removed: toRemove.length,
    tracks_total: items.length,
  };
}

/**
 * Drop pool rows + snapshots for playlists no longer in the config.
 * Cheap safety net so removing a playlist from trending-playlists.ts
 * actually purges its tracks on the next cron run.
 */
async function purgeStale(db: SupabaseClient): Promise<number> {
  const configuredIds = trendingPlaylistIds();
  const { data: snapshots } = await db
    .from("trending_playlist_snapshots")
    .select("playlist_id");
  const stale = (snapshots ?? [])
    .map((s) => s.playlist_id as string)
    .filter((id) => !configuredIds.includes(id));

  if (stale.length === 0) return 0;

  await db.from("trending_track_pool").delete().in("playlist_id", stale);
  await db
    .from("trending_playlist_snapshots")
    .delete()
    .in("playlist_id", stale);
  return stale.length;
}

/**
 * Refresh every configured playlist. Returns per-playlist results so the
 * cron route can log + Sentry-report a partial-failure summary.
 */
export async function refreshAllPlaylists(
  db: SupabaseClient
): Promise<{
  purged: number;
  results: RefreshResult[];
}> {
  const purged = await purgeStale(db);
  const results: RefreshResult[] = [];
  for (const cfg of TRENDING_PLAYLISTS) {
    const result = await refreshPlaylist(db, cfg.id);
    results.push(result);
  }
  return { purged, results };
}

// Avoid unused-import warning when the file evolves.
export type { PoolRow };
