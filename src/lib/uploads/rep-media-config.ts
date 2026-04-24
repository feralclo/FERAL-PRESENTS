/**
 * Single source of truth for the rep-media Supabase bucket's upload caps
 * and MIME allowlist. Used by:
 *   - POST /api/rep-portal/uploads/signed-url  — validates content_type + size_bytes
 *   - POST /api/rep-portal/uploads/complete    — re-verifies size after upload
 *   - supabase/migrations/..._rep_media_bucket_caps.sql — keeps the bucket
 *     config aligned with this file. If you change these constants, run the
 *     migration below so Supabase Storage matches.
 *
 * Why this matters: when the endpoint's allowlist and the bucket's
 * allowlist disagree, the client gets a "valid" signed URL and then 415s
 * on PUT. Before this file, the two were declared in separate places.
 */

// MIME types the rep-media bucket accepts. Must be kept in sync with the
// bucket's allowed_mime_types column (see migration).
export const REP_MEDIA_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const REP_MEDIA_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
] as const;

export const REP_MEDIA_MIME_ALLOWLIST: readonly string[] = [
  ...REP_MEDIA_IMAGE_TYPES,
  ...REP_MEDIA_VIDEO_TYPES,
];

/**
 * Hard ceiling on a single object's size for the entire bucket. The
 * Supabase `file_size_limit` on storage.buckets acts at the PUT layer —
 * anything larger 413s even if the signed-URL endpoint allowed it.
 * Must be ≥ the largest per-kind cap below.
 */
export const REP_MEDIA_BUCKET_BYTES_MAX = 50 * 1024 * 1024;

/**
 * Per-kind limits — tighter than the bucket max. Lets us keep banner
 * uploads at 3MB even though the bucket can technically fit 50MB.
 * These define what /uploads/signed-url enforces before minting a URL.
 */
export interface RepMediaKindConfig {
  prefix: string;
  maxBytes: number;
  /** "image" → allowlist is REP_MEDIA_IMAGE_TYPES; "video" → VIDEO_TYPES. */
  media: "image" | "video";
}

export const REP_MEDIA_KINDS = {
  avatar:       { prefix: "avatars",      maxBytes: 2  * 1024 * 1024, media: "image" },
  banner:       { prefix: "banners",      maxBytes: 3  * 1024 * 1024, media: "image" },
  quest_proof:  { prefix: "quest-proofs", maxBytes: 8  * 1024 * 1024, media: "image" },
  story_image:  { prefix: "stories",      maxBytes: 10 * 1024 * 1024, media: "image" },
  story_video:  { prefix: "stories",      maxBytes: 50 * 1024 * 1024, media: "video" },
} as const satisfies Record<string, RepMediaKindConfig>;

export type RepMediaKind = keyof typeof REP_MEDIA_KINDS;

/**
 * Lookup table /uploads/complete uses to validate post-PUT size.
 * Keyed by the path prefix (not the kind) because that endpoint only sees
 * the storage key, not the original kind name. When multiple kinds share
 * a prefix (story_image + story_video → "stories"), take the max of the
 * two caps — complete/ has no way to distinguish which kind uploaded.
 */
export const REP_MEDIA_PREFIX_CAPS: Record<string, number> = (() => {
  const caps: Record<string, number> = {};
  for (const cfg of Object.values(REP_MEDIA_KINDS)) {
    caps[cfg.prefix] = Math.max(caps[cfg.prefix] ?? 0, cfg.maxBytes);
  }
  return caps;
})();

/**
 * Returns true when the given MIME type is allowed for the given kind.
 * Single choke-point — callers never have to know about the image/video
 * split.
 */
export function isMimeAllowedForKind(kind: RepMediaKind, contentType: string): boolean {
  const cfg = REP_MEDIA_KINDS[kind];
  if (!cfg) return false;
  if (cfg.media === "video") {
    return (REP_MEDIA_VIDEO_TYPES as readonly string[]).includes(contentType);
  }
  return (REP_MEDIA_IMAGE_TYPES as readonly string[]).includes(contentType);
}
