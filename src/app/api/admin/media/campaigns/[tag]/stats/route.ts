import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { isValidCampaignTag } from "@/lib/library/campaign-tag";
import { getMuxThumbnailUrl, isMuxPlaybackId } from "@/lib/mux";
import type {
  CampaignLinkedQuest,
  CampaignStatsResponse,
  CampaignTopAsset,
  QuestAssetMediaKind,
} from "@/types/library-campaigns";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/media/campaigns/[tag]/stats
 *
 * Detail surface for the campaign canvas: stat row + linked quests +
 * top assets + 7-day downloads sparkline.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { tag } = await params;
    if (!isValidCampaignTag(tag)) {
      return NextResponse.json(
        { error: "Invalid campaign tag", code: "invalid_tag" },
        { status: 400 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // 1. Pull the campaign's assets (counts + ids for the downloads
    //    join below).
    const { data: assets } = await db
      .from("tenant_media")
      .select("id, mime_type, url, storage_key, created_at")
      .eq("org_id", orgId)
      .eq("kind", "quest_asset")
      .is("deleted_at", null)
      .contains("tags", [tag]);

    type AssetRow = {
      id: string;
      mime_type: string | null;
      url: string;
      storage_key: string | null;
      created_at: string;
    };
    const assetRows = (assets ?? []) as AssetRow[];
    let imageCount = 0;
    let videoCount = 0;
    for (const a of assetRows) {
      if ((a.mime_type ?? "").startsWith("video/")) videoCount += 1;
      else imageCount += 1;
    }
    const assetIds = assetRows.map((a) => a.id);

    // 2. Linked quests.
    const { data: quests } = await db
      .from("rep_quests")
      .select("id, title, status, cover_image_url, xp_reward, ep_reward")
      .eq("asset_mode", "pool")
      .eq("asset_campaign_tag", tag)
      .order("created_at", { ascending: false });
    const linked: CampaignLinkedQuest[] = (
      (quests ?? []) as Array<{
        id: string;
        title: string;
        status: string;
        cover_image_url: string | null;
        xp_reward: number | null;
        ep_reward: number | null;
      }>
    ).map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      cover_image_url: q.cover_image_url,
      xp_reward: q.xp_reward,
      ep_reward: q.ep_reward,
    }));

    // 3. Download stats — one query for everything we need.
    let topAssets: CampaignTopAsset[] = [];
    let downloadsThisWeek = 0;
    const sparkline = Array.from({ length: 7 }, () => 0);
    const sparklineStart = new Date();
    sparklineStart.setUTCHours(0, 0, 0, 0);
    sparklineStart.setUTCDate(sparklineStart.getUTCDate() - 6);

    if (assetIds.length > 0) {
      const { data: downloads } = await db
        .from("rep_asset_downloads")
        .select("media_id, downloaded_at")
        .in("media_id", assetIds)
        .gte("downloaded_at", sparklineStart.toISOString());

      const counts = new Map<string, number>();
      const allDownloadCounts = new Map<string, number>();
      // Bucket sparkline + per-media counts.
      for (const row of (downloads ?? []) as Array<{
        media_id: string;
        downloaded_at: string;
      }>) {
        downloadsThisWeek += 1;
        counts.set(row.media_id, (counts.get(row.media_id) ?? 0) + 1);
        const day = new Date(row.downloaded_at);
        day.setUTCHours(0, 0, 0, 0);
        const dayIndex = Math.floor(
          (day.getTime() - sparklineStart.getTime()) / 86_400_000
        );
        if (dayIndex >= 0 && dayIndex < 7) sparkline[dayIndex] += 1;
      }
      // For top-assets, get all-time download counts (not just last 7d).
      const { data: allTimeRows } = await db
        .from("rep_asset_downloads")
        .select("media_id")
        .in("media_id", assetIds);
      for (const row of (allTimeRows ?? []) as Array<{ media_id: string }>) {
        allDownloadCounts.set(
          row.media_id,
          (allDownloadCounts.get(row.media_id) ?? 0) + 1
        );
      }
      const ranked = [...assetRows]
        .map((a) => ({
          asset: a,
          count: allDownloadCounts.get(a.id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      topAssets = ranked.map(({ asset, count }) => {
        const mediaKind: QuestAssetMediaKind = (asset.mime_type ?? "").startsWith(
          "video/"
        )
          ? "video"
          : "image";
        const isMux = !!asset.storage_key && isMuxPlaybackId(asset.storage_key);
        return {
          media_id: asset.id,
          url: isMux ? getMuxThumbnailUrl(asset.storage_key as string) : asset.url,
          thumbnail_url: isMux
            ? getMuxThumbnailUrl(asset.storage_key as string)
            : null,
          media_kind: mediaKind,
          download_count: count,
        };
      });
    }

    const body: CampaignStatsResponse = {
      asset_count: assetRows.length,
      image_count: imageCount,
      video_count: videoCount,
      linked_quests: linked,
      top_assets: topAssets,
      downloads_this_week: downloadsThisWeek,
      downloads_sparkline: sparkline,
    };
    return NextResponse.json(body);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/campaigns/[tag]/stats GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
