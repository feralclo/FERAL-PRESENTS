/**
 * Hand-curated platform-level Spotify playlists that feed the rep
 * suggestions endpoint's "trending" section.
 *
 * Edit this file to add/remove sources. The cron at
 * /api/cron/spotify-trending-refresh re-pulls every 6h, detects changes
 * via Spotify's snapshot_id, and stores tracks in `trending_track_pool`.
 *
 * `genre_label` is INTERNAL ONLY — it never reaches the rep UI. It exists
 * for our own analytics + so the affinity engine can later map a rep's
 * picks to "skews schranz" without needing per-rep genre tagging on the
 * frontend. Reps just see a "For you" feed; they never see these labels.
 *
 * Adding a playlist: paste the part after `playlist/` from the URL.
 * e.g. https://open.spotify.com/playlist/37i9dQZF1DWXCzcvFxzeno?si=…
 *      → id: "37i9dQZF1DWXCzcvFxzeno"
 *
 * Removing: just delete the entry. The next cron run will purge its
 * tracks from the pool (refresh logic cleans up stale playlist_ids).
 */

export interface TrendingPlaylistConfig {
  id: string;
  /** Internal-only label. Never shown to reps. */
  genre_label: string;
  /** Human-readable note for maintainers. */
  note: string;
}

export const TRENDING_PLAYLISTS: TrendingPlaylistConfig[] = [
  {
    id: "37i9dQZF1DWXCzcvFxzeno",
    genre_label: "hard-techno-broad",
    note: "Spotify editorial — broad hard dance / hard techno baseline.",
  },
  {
    id: "0epv6Ciaj157eq6aQpeDul",
    genre_label: "bounce-groove",
    note: "Bouncy / groove / hard dance.",
  },
  {
    id: "0r98mjvX7xySTfWgY44G33",
    genre_label: "schranz",
    note: "Schranz.",
  },
  {
    id: "4k1vyKLTFNf8gIMPuFoGpm",
    genre_label: "hard-techno-mixed",
    note: "Hard techno + hard dance.",
  },
];

/** Lookup by id — used by the refresh cron + affinity engine. */
export function getTrendingPlaylist(
  id: string
): TrendingPlaylistConfig | undefined {
  return TRENDING_PLAYLISTS.find((p) => p.id === id);
}

/** All configured playlist ids (cron iterates these). */
export function trendingPlaylistIds(): string[] {
  return TRENDING_PLAYLISTS.map((p) => p.id);
}
