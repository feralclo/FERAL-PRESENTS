/**
 * Shared mapper for rep_stories rows → the iOS-facing story DTO.
 *
 * iOS consumes this shape in three places:
 *   - GET /api/rep-portal/stories/feed       (stories inside each author group)
 *   - GET /api/rep-portal/stories/:id        (single story)
 *   - GET /api/rep-portal/reps/:id/stories   (list of a rep's active stories)
 *
 * Keeping the transform here means all three stay in lockstep — any
 * future field (e.g. reactions) is added once and flows everywhere.
 */

// ─── Rep author — matches the shape iOS decodes for avatars everywhere
export interface StoryAuthor {
  id: string;
  display_name: string | null;
  photo_url: string | null;
  avatar_bg_hex: number;
  initials: string;
  level: number;
}

// ─── iOS spec — a track snapshot stored alongside every story
export interface StoryTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; image_url: string | null };
  preview_url: string | null;
  external_url: string;
  duration_ms: number;
  // Spotify clip window — what portion iOS should play (start + length ms)
  clip_start_ms: number;
  clip_length_ms: number;
  // Author-selected scrub position within the track. Viewers cue the preview
  // here so everyone hears the same drop as the poster. Null when the author
  // didn't scrub (iOS can fall back to client-side drop detection).
  start_offset_ms: number | null;
}

export interface StoryDTO {
  id: string;
  author: StoryAuthor;
  media_url: string;
  media_kind: "image" | "video";
  media_width: number | null;
  media_height: number | null;
  video_duration_ms: number | null;
  caption: string | null;
  track: StoryTrack;
  event_id: string | null;
  promoter_id: string | null;
  visibility: "public" | "followers";
  /** Author-only; null for non-authors (iOS privacy spec). */
  view_count: number | null;
  is_viewed_by_me: boolean;
  is_mine: boolean;
  expires_at: string;
  created_at: string;
}

// ─── Supporting row shapes that callers fetch from the DB ──────────────────

export interface StoryRow {
  id: string;
  author_rep_id: string;
  media_url: string;
  media_kind: "image" | "video";
  media_width: number | null;
  media_height: number | null;
  duration_ms: number | null; // video duration
  caption: string | null;

  spotify_track_id: string;
  spotify_track_title: string;
  spotify_track_artist: string | null;
  spotify_artists: { id: string; name: string }[] | null;
  spotify_album_name: string | null;
  spotify_album_image_url: string | null;
  spotify_preview_url: string;
  spotify_external_url: string | null;
  spotify_duration_ms: number | null;
  spotify_clip_start_ms: number;
  spotify_clip_length_ms: number;
  track_start_offset_ms: number | null;

  event_id: string | null;
  promoter_id: string | null;
  visibility: string;
  view_count: number;
  expires_at: string;
  created_at: string;
}

export interface AuthorRow {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  level: number | null;
}

export const STORY_SELECT = `
  id, author_rep_id, media_url, media_kind, media_width, media_height, duration_ms, caption,
  spotify_track_id, spotify_track_title, spotify_track_artist, spotify_artists,
  spotify_album_name, spotify_album_image_url, spotify_preview_url,
  spotify_external_url, spotify_duration_ms,
  spotify_clip_start_ms, spotify_clip_length_ms, track_start_offset_ms,
  event_id, promoter_id, visibility, view_count, expires_at, created_at
` as const;

// ─── Deterministic avatar colour (shared with leaderboard hashing) ────────
const AVATAR_PALETTE = [
  0x6366f1, 0x8b5cf6, 0xa78bfa, 0xec4899, 0xf43f5e, 0xf97316, 0xf59e0b,
  0x10b981, 0x14b8a6, 0x06b6d4, 0x0ea5e9, 0x3b82f6, 0x4f46e5, 0xd946ef,
];
function avatarBgHexFor(repId: string): number {
  let h = 0;
  for (let i = 0; i < repId.length; i++) h = (h * 31 + repId.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function initialsFor(author: AuthorRow): string {
  const f = (author.first_name ?? "").trim();
  const l = (author.last_name ?? "").trim();
  if (f && l) return (f.charAt(0) + l.charAt(0)).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  const d = (author.display_name ?? "").trim();
  if (d) {
    const parts = d.split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return d.slice(0, 2).toUpperCase();
  }
  return "?";
}

export function toStoryAuthor(author: AuthorRow): StoryAuthor {
  return {
    id: author.id,
    display_name: author.display_name,
    photo_url: author.photo_url,
    avatar_bg_hex: avatarBgHexFor(author.id),
    initials: initialsFor(author),
    level: author.level ?? 1,
  };
}

/**
 * Build the iOS `track` snapshot from the story row. Prefers the newer
 * columns (spotify_artists jsonb, spotify_album_name, etc.) and falls
 * back to the legacy flat columns so stories created before the snapshot
 * rebuild still render.
 */
function toStoryTrack(row: StoryRow): StoryTrack {
  const artistsFromNew = row.spotify_artists;
  const artists =
    artistsFromNew && Array.isArray(artistsFromNew) && artistsFromNew.length > 0
      ? artistsFromNew.map((a) => ({ id: a.id ?? "", name: a.name ?? "" }))
      : row.spotify_track_artist
      ? [{ id: "", name: row.spotify_track_artist }]
      : [];

  return {
    id: row.spotify_track_id,
    name: row.spotify_track_title,
    artists,
    album: {
      name: row.spotify_album_name ?? "",
      image_url: row.spotify_album_image_url,
    },
    preview_url: row.spotify_preview_url || null,
    external_url:
      row.spotify_external_url ?? `https://open.spotify.com/track/${row.spotify_track_id}`,
    duration_ms: row.spotify_duration_ms ?? 0,
    clip_start_ms: row.spotify_clip_start_ms,
    clip_length_ms: row.spotify_clip_length_ms,
    // 0 is the default column value, so "never scrubbed" and "scrubbed to 0"
    // are indistinguishable server-side. iOS treats 0 as "start at 0" anyway
    // — the null escape hatch exists for future use (e.g. if we add a
    // sentinel to mean "use drop detection").
    start_offset_ms: row.track_start_offset_ms,
  };
}

export function toStoryDTO(
  row: StoryRow,
  author: AuthorRow,
  opts: { viewerId: string; viewedByMe: boolean }
): StoryDTO {
  const isMine = row.author_rep_id === opts.viewerId;
  return {
    id: row.id,
    author: toStoryAuthor(author),
    media_url: row.media_url,
    media_kind: row.media_kind,
    media_width: row.media_width,
    media_height: row.media_height,
    video_duration_ms: row.duration_ms,
    caption: row.caption,
    track: toStoryTrack(row),
    event_id: row.event_id,
    promoter_id: row.promoter_id,
    visibility: (row.visibility === "followers" ? "followers" : "public"),
    // view_count privacy: only the author sees it
    view_count: isMine ? row.view_count : null,
    is_viewed_by_me: isMine ? true : opts.viewedByMe,
    is_mine: isMine,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}
