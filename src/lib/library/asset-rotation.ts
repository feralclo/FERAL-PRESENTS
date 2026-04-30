/**
 * Pool-quest rotation engine.
 *
 * Decides which 10 assets a rep sees when they open a quest with
 * `asset_mode = 'pool'`. The ordering is the heart of the feature: it
 * keeps the feed feeling fresh as new assets land and as reps download
 * what they already have.
 *
 * The contract (locked in LIBRARY-CAMPAIGNS-PLAN.md):
 *   1. Assets the rep has NEVER downloaded come first, ordered by
 *      `created_at DESC` (newest uploads bubble up).
 *   2. Assets the rep HAS downloaded come next, ordered by their last
 *      download date — oldest first (so a rep who's used everything
 *      cycles back through their longest-ago-used).
 *   3. Take the first `limit` (default 10).
 *
 * Split into a pure ranker (`rotateAssets`) and a DB-shell
 * (`getRotatedAssetsForRep`) so the algorithm can be tested without
 * touching Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMuxStreamUrl,
  getMuxThumbnailUrl,
  isMuxPlaybackId,
} from "@/lib/mux";
import type {
  CampaignSummaryStats,
  QuestAssetDTO,
  QuestAssetMediaKind,
  QuestAssetRotationPosition,
  RecordAssetDownloadResult,
} from "@/types/library-campaigns";

// ---------------------------------------------------------------------------
// Pure-function core (the algorithm)
// ---------------------------------------------------------------------------

/** Minimum shape needed to rank a candidate asset. */
export interface AssetRankInput {
  id: string;
  /** ISO 8601 — when the tenant uploaded this asset. */
  created_at: string;
  /** ISO 8601 — when the rep last downloaded this asset.
   *  null = never downloaded by this rep. */
  rep_last_downloaded_at: string | null;
}

/**
 * Sort + slice a candidate pool into the rotation order.
 *
 * Pure function: same inputs always produce the same outputs. Stable for
 * ties (preserves input order when two assets compare equal).
 */
export function rotateAssets<T extends AssetRankInput>(
  candidates: T[],
  limit = 10
): T[] {
  // Decorate with a sortable signature, then sort, then strip.
  // signature: [bucketIndex, secondaryKey]
  //   bucket 0 = never downloaded (sort by created_at DESC)
  //   bucket 1 = downloaded     (sort by rep_last_downloaded_at ASC)
  const decorated = candidates.map((item, i) => {
    const isUsed = item.rep_last_downloaded_at !== null;
    const bucket = isUsed ? 1 : 0;
    const secondary = isUsed
      ? new Date(item.rep_last_downloaded_at as string).getTime() // ASC
      : -new Date(item.created_at).getTime(); // DESC (negate for ASC compare)
    return { item, bucket, secondary, index: i };
  });

  decorated.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.secondary !== b.secondary) return a.secondary - b.secondary;
    return a.index - b.index; // stable
  });

  return decorated.slice(0, limit).map((d) => d.item);
}

/** Decide the human-friendly "where in the rotation" label for a rep. */
export function rotationPositionFor(
  ranked: AssetRankInput[],
  totalInPool: number
): QuestAssetRotationPosition {
  if (ranked.length === 0) return "fresh";
  const everyShownIsUsed = ranked.every(
    (a) => a.rep_last_downloaded_at !== null
  );
  if (everyShownIsUsed) return "all-used";
  // If the rep has used at least one in this slice, but not all, they're
  // somewhere in the middle.
  const someShownIsUsed = ranked.some((a) => a.rep_last_downloaded_at !== null);
  if (someShownIsUsed) return "mixed";
  // Edge case: caller passed only fresh items but the pool contains used
  // ones the rep would see if they kept scrolling. We treat that as fresh
  // for UX honesty — what they see is fresh.
  void totalInPool;
  return "fresh";
}

// ---------------------------------------------------------------------------
// DB shell — wraps the pure functions with Supabase fetches
// ---------------------------------------------------------------------------

/** Raw columns fetched from `tenant_media` for the rotation query. */
interface TenantMediaRow {
  id: string;
  url: string;
  storage_key: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  kind: string;
}

interface RotationRowEnriched extends TenantMediaRow, AssetRankInput {
  download_count_total: number;
}

interface GetRotatedAssetsForRepArgs {
  orgId: string;
  repId: string;
  campaignTag: string;
  limit?: number;
}

interface GetRotatedAssetsForRepResult {
  data: QuestAssetDTO[];
  total_in_pool: number;
  rotation_position: QuestAssetRotationPosition;
}

/**
 * Fetch + rank the rotation slice for a rep × campaign.
 *
 * Single-tenant scoped: `org_id` is mandatory; we never look across orgs.
 * Caller is responsible for verifying the rep is on the campaign's
 * promoter team before invoking this.
 */
export async function getRotatedAssetsForRep(
  client: SupabaseClient,
  { orgId, repId, campaignTag, limit = 10 }: GetRotatedAssetsForRepArgs
): Promise<GetRotatedAssetsForRepResult> {
  // 1. Pull every non-deleted asset in the campaign. Pool sizes are small
  //    enough (typically 20–500) that a single SELECT beats a windowed
  //    SQL ordering with an OFFSET — we sort in JS and only ship the
  //    final 10 as DTOs.
  const { data: assetsRaw, error: assetsErr } = await client
    .from("tenant_media")
    .select(
      "id, url, storage_key, mime_type, width, height, created_at, kind"
    )
    .eq("org_id", orgId)
    .eq("kind", "quest_asset")
    .is("deleted_at", null)
    .contains("tags", [campaignTag]);

  if (assetsErr) throw assetsErr;
  const assets = (assetsRaw ?? []) as TenantMediaRow[];
  if (assets.length === 0) {
    return { data: [], total_in_pool: 0, rotation_position: "fresh" };
  }

  // 2. Fetch the rep's download history for those media ids in one go.
  const mediaIds = assets.map((a) => a.id);
  const { data: dlRaw, error: dlErr } = await client
    .from("rep_asset_downloads")
    .select("media_id, downloaded_at")
    .eq("rep_id", repId)
    .in("media_id", mediaIds);
  if (dlErr) throw dlErr;
  const repDownloads = new Map<string, string>();
  for (const row of dlRaw ?? []) {
    const r = row as { media_id: string; downloaded_at: string };
    repDownloads.set(r.media_id, r.downloaded_at);
  }

  // 3. Fetch global download counts for those media ids. Cheap because
  //    we filter by `media_id IN (...)` and the index covers it.
  const { data: countsRaw, error: countsErr } = await client
    .from("rep_asset_downloads")
    .select("media_id")
    .in("media_id", mediaIds);
  if (countsErr) throw countsErr;
  const downloadCounts = new Map<string, number>();
  for (const row of countsRaw ?? []) {
    const r = row as { media_id: string };
    downloadCounts.set(r.media_id, (downloadCounts.get(r.media_id) ?? 0) + 1);
  }

  // 4. Rank the candidates.
  const enriched: RotationRowEnriched[] = assets.map((a) => ({
    ...a,
    rep_last_downloaded_at: repDownloads.get(a.id) ?? null,
    download_count_total: downloadCounts.get(a.id) ?? 0,
  }));
  const ranked = rotateAssets(enriched, limit);

  // 5. Project to DTOs.
  const data = ranked.map((row) => toQuestAssetDTO(row, repDownloads));
  return {
    data,
    total_in_pool: assets.length,
    rotation_position: rotationPositionFor(ranked, assets.length),
  };
}

/**
 * Build the lightweight summary embedded on quest list/detail responses
 * so iOS can show "47 assets" + a 3-up thumbnail strip without a second
 * fetch.
 */
export async function summariseCampaignAssets(
  client: SupabaseClient,
  { orgId, campaignTag }: { orgId: string; campaignTag: string }
): Promise<CampaignSummaryStats> {
  const { data, error } = await client
    .from("tenant_media")
    .select("id, url, storage_key, mime_type, created_at")
    .eq("org_id", orgId)
    .eq("kind", "quest_asset")
    .is("deleted_at", null)
    .contains("tags", [campaignTag])
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  let imageCount = 0;
  let videoCount = 0;
  for (const r of rows) {
    if ((r.mime_type ?? "").startsWith("video/")) videoCount += 1;
    else imageCount += 1;
  }

  return {
    count: rows.length,
    image_count: imageCount,
    video_count: videoCount,
    sample_thumb_urls: rows.slice(0, 3).map((r) => thumbnailUrlFor(r)),
  };
}

/**
 * Idempotent record of a rep's download. Returns whether this was the
 * first time — the API uses that to drive the optimistic "Used" pill on
 * iOS.
 */
export async function recordAssetDownload(
  client: SupabaseClient,
  args: {
    orgId: string;
    repId: string;
    mediaId: string;
    questId: string | null;
  }
): Promise<RecordAssetDownloadResult> {
  // upsert with ignoreDuplicates: returns [] when the row already exists,
  // returns [row] when freshly inserted.
  const { data, error } = await client
    .from("rep_asset_downloads")
    .upsert(
      {
        rep_id: args.repId,
        media_id: args.mediaId,
        quest_id: args.questId,
        org_id: args.orgId,
      },
      { onConflict: "rep_id,media_id", ignoreDuplicates: true }
    )
    .select("id");
  if (error) throw error;
  return { first_time: (data ?? []).length > 0 };
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

function toQuestAssetDTO(
  row: RotationRowEnriched,
  repDownloads: Map<string, string>
): QuestAssetDTO {
  const isVideo = (row.mime_type ?? "").startsWith("video/");
  const lastUsed = repDownloads.get(row.id) ?? null;
  const muxId = isVideo ? extractMuxPlaybackId(row) : null;

  if (isVideo && muxId) {
    return {
      id: row.id,
      media_kind: "video",
      url: getMuxThumbnailUrl(muxId),
      thumbnail_url: getMuxThumbnailUrl(muxId),
      playback_url: getMuxStreamUrl(muxId),
      width: row.width,
      height: row.height,
      duration_seconds: null,
      is_downloaded_by_me: lastUsed !== null,
      my_last_used_at: lastUsed,
      download_count_total: row.download_count_total,
    };
  }

  return {
    id: row.id,
    media_kind: isVideo ? "video" : "image",
    url: row.url,
    thumbnail_url: isVideo ? row.url : null,
    playback_url: isVideo ? row.url : null,
    width: row.width,
    height: row.height,
    duration_seconds: null,
    is_downloaded_by_me: lastUsed !== null,
    my_last_used_at: lastUsed,
    download_count_total: row.download_count_total,
  };
}

/** Mux playback id is stored on `storage_key` for video uploads. */
function extractMuxPlaybackId(row: TenantMediaRow): string | null {
  const candidate = row.storage_key ?? "";
  if (candidate && isMuxPlaybackId(candidate)) return candidate;
  return null;
}

function thumbnailUrlFor(row: {
  url: string;
  storage_key: string | null;
  mime_type: string | null;
}): string {
  const isVideo = (row.mime_type ?? "").startsWith("video/");
  if (isVideo && row.storage_key && isMuxPlaybackId(row.storage_key)) {
    return getMuxThumbnailUrl(row.storage_key);
  }
  return row.url;
}

/** Convenience for callers that just need the kind classification. */
export function classifyMediaKind(mimeType: string | null): QuestAssetMediaKind {
  return (mimeType ?? "").startsWith("video/") ? "video" : "image";
}
