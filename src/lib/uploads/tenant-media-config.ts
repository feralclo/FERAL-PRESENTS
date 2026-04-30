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

export const TENANT_MEDIA_BUCKET_BYTES_MAX = 10 * 1024 * 1024;

export const TENANT_MEDIA_KINDS = {
  quest_cover:  { prefix: "quest-covers",  maxBytes: 8 * 1024 * 1024 },
  event_cover:  { prefix: "event-covers",  maxBytes: 8 * 1024 * 1024 },
  reward_cover: { prefix: "reward-covers", maxBytes: 8 * 1024 * 1024 },
  generic:      { prefix: "generic",       maxBytes: 8 * 1024 * 1024 },
} as const;

export type TenantMediaKind = keyof typeof TENANT_MEDIA_KINDS;

export function isTenantMediaKind(value: string): value is TenantMediaKind {
  return value in TENANT_MEDIA_KINDS;
}

export function isMimeAllowedForTenantMedia(contentType: string): boolean {
  return (TENANT_MEDIA_IMAGE_TYPES as readonly string[]).includes(contentType);
}
