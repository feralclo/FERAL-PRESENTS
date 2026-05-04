/**
 * Hand-curated platform-level Spotify playlists that feed the rep
 * suggestions endpoint.
 *
 * Maintenance:
 *   - Edit this file to add/remove sources or rename sections.
 *   - The cron at /api/cron/spotify-trending-refresh re-pulls every 6h
 *     via the public embed-page workaround (Spotify's API blocks bulk
 *     playlist track access for our app — see playlist-refresh.ts).
 *
 * Adding a playlist: paste the part after `playlist/` in the share URL.
 *   https://open.spotify.com/playlist/0r98mjvX7xySTfWgY44G33?si=…
 *   → id: "0r98mjvX7xySTfWgY44G33"
 *
 * What each field controls:
 *   - section_label: rep-facing section title in the picker. null = no
 *     dedicated section, this playlist's tracks only feed "For You".
 *   - subgenres: optional list of subgenres covered, surfaced as a
 *     subtitle/chip set under the section header. iOS chooses rendering.
 *   - display_order: lower = earlier in the genre list (after For You).
 *   - genre_label: internal-only analytics tag, never reaches reps.
 */

export interface TrendingPlaylistConfig {
  id: string;
  /** Internal-only label. Never shown to reps. */
  genre_label: string;
  /** Rep-facing section title. null → tracks contribute to "For You" only. */
  section_label: string | null;
  /** Subgenres covered by this playlist (rep-facing under section title). */
  subgenres: string[];
  /** Order among genre sections (lower = earlier). */
  display_order: number;
  /** Maintainer note. */
  note: string;
}

export const TRENDING_PLAYLISTS: TrendingPlaylistConfig[] = [
  {
    // Spotify editorial — broad, overlaps with the dedicated Hard Techno
    // section below. Folded into For You only so reps don't see two
    // similarly-named rows.
    id: "37i9dQZF1DWXCzcvFxzeno",
    genre_label: "hard-techno-broad",
    section_label: null,
    subgenres: [],
    display_order: 999,
    note: "Spotify editorial — broad hard dance / hard techno. For You only.",
  },
  {
    id: "4k1vyKLTFNf8gIMPuFoGpm",
    genre_label: "hard-techno",
    section_label: "Hard Techno",
    subgenres: ["Hard Techno", "Rave"],
    display_order: 1,
    note: "VERKNIPT — Hard Techno & Rave.",
  },
  {
    id: "0r98mjvX7xySTfWgY44G33",
    genre_label: "schranz",
    section_label: "Schranz",
    subgenres: ["Schranz", "Melodic Schranz", "Emotional Schranz"],
    display_order: 2,
    note: "VERKNIPT — Schranz family.",
  },
  {
    id: "0epv6Ciaj157eq6aQpeDul",
    genre_label: "hard-dance",
    section_label: "Hard Dance",
    subgenres: ["Hard House", "Bounce", "Trance", "Hard Trance", "Groove"],
    display_order: 3,
    note: "Pulse. by Verknipt — hard dance umbrella.",
  },
];

/** All configured playlist ids (cron iterates these). */
export function trendingPlaylistIds(): string[] {
  return TRENDING_PLAYLISTS.map((p) => p.id);
}

/** Lookup by id — used by refresh cron + suggestions orchestrator. */
export function getTrendingPlaylist(
  id: string
): TrendingPlaylistConfig | undefined {
  return TRENDING_PLAYLISTS.find((p) => p.id === id);
}

/** Playlists that get their own genre section in the picker, sorted by
 *  display_order. The Spotify editorial broad one is excluded. */
export function genreSectionPlaylists(): TrendingPlaylistConfig[] {
  return TRENDING_PLAYLISTS.filter((p) => p.section_label !== null).sort(
    (a, b) => a.display_order - b.display_order
  );
}
