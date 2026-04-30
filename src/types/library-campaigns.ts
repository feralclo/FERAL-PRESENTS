/**
 * Shared types for the Library Campaigns + Pool Quests feature.
 *
 * Used by:
 *   - Admin API routes under /api/admin/media/campaigns/*
 *   - Rep-facing API routes under /api/rep-portal/quests/[id]/assets/*
 *   - Admin UI components in src/components/admin/library/
 *   - Quest editor pool picker
 *
 * iOS team consumes these shapes via docs/ios-quest-pool-contract.md —
 * keep the JSON keys (snake_case where used) stable; renaming requires
 * a contract bump.
 */

// ---------- Quest pool mode ----------

export type QuestAssetMode = "single" | "pool";

/** Summary of a quest's pool, embedded on the quest list/detail responses. */
export interface QuestAssetPoolSummary {
  count: number;
  image_count: number;
  video_count: number;
  /** Up to 3 thumbnail URLs for inline previews on quest cards. */
  sample_thumbs: string[];
}

// ---------- Rep-facing asset feed ----------

export type QuestAssetMediaKind = "image" | "video";

/** A single rotated asset returned to a rep. */
export interface QuestAssetDTO {
  id: string;
  media_kind: QuestAssetMediaKind;
  /** Image: WebP URL. Video: thumbnail URL (same as `thumbnail_url`). */
  url: string;
  /** Video only — HLS playback URL for in-app preview. */
  playback_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  is_downloaded_by_me: boolean;
  /** ISO 8601, null when never downloaded by this rep. */
  my_last_used_at: string | null;
  download_count_total: number;
}

export type QuestAssetRotationPosition = "fresh" | "mixed" | "all-used";

export interface QuestAssetCampaignBlock {
  label: string;
  total_in_pool: number;
}

export interface QuestAssetsResponse {
  data: QuestAssetDTO[];
  campaign: QuestAssetCampaignBlock;
  rotation_position: QuestAssetRotationPosition;
}

export interface QuestAssetDownloadResponse {
  url: string;
  /** ISO 8601, null for permanent public URLs (images). */
  expires_at: string | null;
  /** True if this was the rep's first download of this asset. */
  first_time: boolean;
}

// ---------- Admin-facing campaigns ----------

/** A row in the Library workspace's campaign rail. */
export interface CampaignSummary {
  /** The slug stored in `tenant_media.tags[0]`. */
  tag: string;
  /** Display label kept in admin app state (derived from tag on first
   * surface, then preserved by the API as a 1:1 lookup). */
  label: string;
  asset_count: number;
  image_count: number;
  video_count: number;
  /** How many `rep_quests` reference this campaign via
   * `asset_campaign_tag` (any status). */
  linked_quest_count: number;
  /** ISO 8601 — created_at of the first asset to land in this campaign;
   * lets the rail sort newest-first. */
  first_seen_at: string;
}

export interface CampaignLinkedQuest {
  id: string;
  title: string;
  status: string;
  cover_image_url: string | null;
  xp_reward: number | null;
  ep_reward: number | null;
}

export interface CampaignTopAsset {
  media_id: string;
  url: string;
  thumbnail_url: string | null;
  media_kind: QuestAssetMediaKind;
  download_count: number;
}

export interface CampaignStatsResponse {
  asset_count: number;
  image_count: number;
  video_count: number;
  linked_quests: CampaignLinkedQuest[];
  top_assets: CampaignTopAsset[];
  downloads_this_week: number;
  /** 7-day daily download counts, oldest-first. */
  downloads_sparkline: number[];
}

// ---------- Internal helpers ----------

/** What `recordAssetDownload` returns. */
export interface RecordAssetDownloadResult {
  /** True iff this insert was net-new (rep had never downloaded the asset
   * before). False on idempotent re-calls. */
  first_time: boolean;
}

/** What `summariseCampaignAssets` returns. */
export interface CampaignSummaryStats {
  count: number;
  image_count: number;
  video_count: number;
  /** Up to 3 thumbnails, ordered by newest. */
  sample_thumb_urls: string[];
}
