/**
 * Playlist refresh — pulls each configured Spotify playlist, diffs against
 * what we have stored, and updates `trending_track_pool` + the snapshot
 * meta table.
 *
 * Implementation note (2026-05-04): Spotify's Nov 2024 API changes
 * blocked /playlists/{id}/tracks AND the batch /tracks?ids= endpoint for
 * apps that don't have Extended Quota Mode. The base /v1/playlists/{id}
 * endpoint silently strips the `tracks` field. So we get the track LIST
 * by parsing Spotify's public embed page (server-rendered HTML, available
 * to anyone who embeds a playlist on a third-party site — no auth) and
 * enrich each track via /v1/tracks/{id} (single-track endpoint, still
 * unrestricted under Client Credentials). See the `getPlaylistViaEmbed`
 * doc in spotify/client.ts for the full rationale.
 *
 * Per-playlist behavior:
 *   - synthetic_snapshot_id unchanged → skip the heavy enrichment, bump
 *     last_refreshed_at
 *   - changed → diff insert/update/delete; only NEW tracks need a Spotify
 *     metadata fetch (existing rows keep their cached track_data)
 *   - playlist 404'd → reported as missing
 */

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPlaylistViaEmbed,
  getTrack,
  isConfigured as isSpotifyConfigured,
  type SpotifyTrack,
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
  enrich_failures?: number;
  error?: string;
}

/** Fetch single-track metadata in chunks so we don't blow Spotify rate limits
 *  or the cron's serverless timeout. 8-wide is fine — ~100 tracks completes
 *  in well under 10s in practice. */
async function enrichTracks(
  ids: string[]
): Promise<Map<string, SpotifyTrack>> {
  const out = new Map<string, SpotifyTrack>();
  const chunkSize = 8;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          const t = await getTrack(id);
          return [id, t] as const;
        } catch (err) {
          Sentry.captureException(err, {
            level: "warning",
            extra: { step: "enrichTracks", trackId: id },
          });
          return [id, null] as const;
        }
      })
    );
    for (const [id, track] of results) {
      if (track) out.set(id, track);
    }
  }
  return out;
}

/**
 * Refresh a single playlist via the embed-scrape path.
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

  let embed;
  try {
    embed = await getPlaylistViaEmbed(playlistId);
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      extra: { step: "refreshPlaylist:getPlaylistViaEmbed", playlistId },
    });
    return {
      playlist_id: playlistId,
      status: "error",
      error: err instanceof Error ? err.message.slice(0, 200) : "embed_fetch_failed",
    };
  }

  if (!embed) {
    return { playlist_id: playlistId, status: "missing" };
  }

  // Cheap path: synthetic snapshot unchanged, bump last_refreshed_at and exit.
  const { data: existingSnapshot } = await db
    .from("trending_playlist_snapshots")
    .select("snapshot_id")
    .eq("playlist_id", playlistId)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (
    existingSnapshot?.snapshot_id &&
    existingSnapshot.snapshot_id === embed.synthetic_snapshot_id
  ) {
    await db
      .from("trending_playlist_snapshots")
      .update({
        last_refreshed_at: nowIso,
        spotify_name: embed.name,
        total_tracks: embed.total_tracks,
      })
      .eq("playlist_id", playlistId);
    return {
      playlist_id: playlistId,
      status: "skipped_unchanged",
      tracks_total: embed.total_tracks,
    };
  }

  // Heavy path: diff incoming embed against pool.
  const { data: existingRows } = await db
    .from("trending_track_pool")
    .select("track_id")
    .eq("playlist_id", playlistId);
  const existingIds = new Set((existingRows ?? []).map((r) => r.track_id));
  const incomingIds = new Set(embed.tracks.map((t) => t.id));

  const toRemove: string[] = [];
  for (const id of existingIds) {
    if (!incomingIds.has(id)) toRemove.push(id);
  }

  // Only NEW tracks need a Spotify metadata fetch — existing rows already
  // have track_data cached. Big efficiency win: most refreshes touch only
  // a few tracks even when the snapshot changed (Spotify rolls position
  // bumps into the same snapshot delta).
  const newTrackIds = embed.tracks
    .map((t) => t.id)
    .filter((id) => !existingIds.has(id));

  const enriched = await enrichTracks(newTrackIds);
  const enrichFailures = newTrackIds.length - enriched.size;

  // Insert new tracks. We don't have curator's `added_at` from the embed,
  // so we use `first_seen_at = now()` for the freshness signal — the
  // moment WE noticed the track in the playlist becomes its "added at"
  // anchor. Existing rows' first_seen_at is preserved (we don't touch it).
  const insertRows = embed.tracks
    .filter((t) => !existingIds.has(t.id))
    .map((t) => {
      const meta = enriched.get(t.id);
      if (!meta) return null;
      return {
        playlist_id: playlistId,
        track_id: t.id,
        position: t.position,
        added_at_spotify: nowIso, // best available — embed doesn't expose curator add date
        first_seen_at: nowIso,
        // The embed gives us a popularity signal indirectly via position
        // (curators front-load favorites). Spotify's `popularity` field
        // also comes back from getTrack — but it's per-track popularity,
        // not playlist-position. We capture both: popularity from
        // getTrack response is implicit in track_data; for the column
        // (used by smart-mix's popularity floor), we read it off meta.
        popularity:
          ((meta as unknown as { popularity?: number }).popularity ?? 50),
        track_data: meta,
        refreshed_at: nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (insertRows.length > 0) {
    const { error } = await db
      .from("trending_track_pool")
      .insert(insertRows);
    if (error) {
      Sentry.captureException(error, {
        level: "warning",
        extra: {
          step: "refreshPlaylist:insert",
          playlistId,
          count: insertRows.length,
        },
      });
    }
  }

  // Update positions for tracks still in the playlist (curator may have
  // reordered). We don't refresh popularity/track_data here — that's only
  // re-pulled when a track is genuinely new. Keeps this step cheap.
  const positionUpdates = embed.tracks.filter((t) => existingIds.has(t.id));
  for (const t of positionUpdates) {
    await db
      .from("trending_track_pool")
      .update({ position: t.position, refreshed_at: nowIso })
      .eq("playlist_id", playlistId)
      .eq("track_id", t.id);
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
        extra: {
          step: "refreshPlaylist:delete",
          playlistId,
          count: toRemove.length,
        },
      });
    }
  }

  await db.from("trending_playlist_snapshots").upsert({
    playlist_id: playlistId,
    snapshot_id: embed.synthetic_snapshot_id,
    spotify_name: embed.name,
    total_tracks: embed.total_tracks,
    last_refreshed_at: nowIso,
  });

  return {
    playlist_id: playlistId,
    status: "refreshed",
    tracks_added: insertRows.length,
    tracks_removed: toRemove.length,
    tracks_total: embed.tracks.length,
    enrich_failures: enrichFailures > 0 ? enrichFailures : undefined,
  };
}

/**
 * Drop pool rows + snapshots for playlists no longer in the config.
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
 * Refresh every configured playlist.
 */
export async function refreshAllPlaylists(
  db: SupabaseClient
): Promise<{ purged: number; results: RefreshResult[] }> {
  const purged = await purgeStale(db);
  const results: RefreshResult[] = [];
  for (const cfg of TRENDING_PLAYLISTS) {
    const result = await refreshPlaylist(db, cfg.id);
    results.push(result);
  }
  return { purged, results };
}
