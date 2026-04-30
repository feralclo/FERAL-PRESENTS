/**
 * Tenant-media upload caps + MIME allowlist.
 *
 * Used by the admin media library — quest covers, event covers, etc.
 * Different from rep-media: admin-uploaded (not rep-uploaded), images only,
 * org-scoped storage paths.
 *
 * Single source of truth, mirrored by the storage bucket's
 * allowed_mime_types / file_size_limit (see migration
 * tenant_media_library).
 */

export const TENANT_MEDIA_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

// Raised from 10MB → 25MB after admins tried bulk-uploading phone photos
// at full resolution (HEIC + 48MP routinely > 8MB). Sharp on the server
// always resizes to fit 1200×1600 + WebP, so what gets to iOS is identical
// (~60–200KB per cover). The cap protects against pathological uploads
// (50MP scans, multi-page PDFs as images, etc) and matches the bucket's
// storage.file_size_limit.
export const TENANT_MEDIA_BUCKET_BYTES_MAX = 25 * 1024 * 1024;

export const TENANT_MEDIA_KINDS = {
  quest_cover:  { prefix: "quest-covers",  maxBytes: 25 * 1024 * 1024 },
  event_cover:  { prefix: "event-covers",  maxBytes: 25 * 1024 * 1024 },
  reward_cover: { prefix: "reward-covers", maxBytes: 25 * 1024 * 1024 },
  generic:      { prefix: "generic",       maxBytes: 25 * 1024 * 1024 },
} as const;

export type TenantMediaKind = keyof typeof TENANT_MEDIA_KINDS;

export function isTenantMediaKind(value: string): value is TenantMediaKind {
  return value in TENANT_MEDIA_KINDS;
}

export function isMimeAllowedForTenantMedia(contentType: string): boolean {
  return (TENANT_MEDIA_IMAGE_TYPES as readonly string[]).includes(contentType);
}
