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

// Storage cap is 50MB. The client always downscales files >5MB to fit
// 2400×3200 @ q92 JPEG before upload (see lib/uploads/prepare-upload.ts),
// so almost everything lands well under this — but admins legitimately
// uploading high-fidelity poster designs / scanned artwork need headroom.
// Sharp on the server always resizes to fit 1200×1600 + WebP, so what
// reaches iOS is identical (~60–200KB) regardless of input size. Matches
// the bucket's storage.file_size_limit.
export const TENANT_MEDIA_BUCKET_BYTES_MAX = 50 * 1024 * 1024;

// Browser-safety hard ceiling on the RAW input file before any prep —
// canvas-decoding a 200MB image will crash Safari. We refuse anything
// over this upfront. In practice nobody hits this; if they do, they
// should resize before uploading.
export const TENANT_MEDIA_RAW_INPUT_MAX = 150 * 1024 * 1024;

export const TENANT_MEDIA_KINDS = {
  quest_cover:   { prefix: "quest-covers",   maxBytes: 50 * 1024 * 1024 },
  // Story / shareable creative for quests — what reps download and post to
  // TikTok/Instagram. Distinct from quest_cover because content can have
  // baked-in text and is typically 9:16 portrait vs the cover's clean 3:4
  // designed for iOS overlay. Video content still flows through Mux (separate).
  quest_content: { prefix: "quest-content",  maxBytes: 50 * 1024 * 1024 },
  // Pool-quest assets — bulk-uploaded creatives a tenant assigns to a
  // campaign (tags[0] = campaign slug). When a quest's asset_mode = 'pool',
  // reps see a rotating window pulled from this kind. Same storage cap as
  // quest_content; videos route through Mux at the API layer.
  quest_asset:   { prefix: "quest-assets",   maxBytes: 50 * 1024 * 1024 },
  event_cover:   { prefix: "event-covers",   maxBytes: 50 * 1024 * 1024 },
  reward_cover:  { prefix: "reward-covers",  maxBytes: 50 * 1024 * 1024 },
  generic:       { prefix: "generic",        maxBytes: 50 * 1024 * 1024 },
} as const;

export type TenantMediaKind = keyof typeof TENANT_MEDIA_KINDS;

export function isTenantMediaKind(value: string): value is TenantMediaKind {
  return value in TENANT_MEDIA_KINDS;
}

export function isMimeAllowedForTenantMedia(contentType: string): boolean {
  return (TENANT_MEDIA_IMAGE_TYPES as readonly string[]).includes(contentType);
}
