import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";
import {
  isValidCampaignTag,
  slugifyCampaignLabel,
} from "@/lib/library/campaign-tag";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/admin/media/complete-video
 *
 * Finalises a Mux-backed video upload as a `tenant_media` row of kind
 * `quest_asset`. The flow is:
 *   1. Client called /api/upload-video → got a signed Supabase Storage
 *      URL, PUT the bytes there.
 *   2. Client called /api/mux/upload (server-to-server pull from the
 *      Storage URL) → got a Mux asset_id back.
 *   3. Client polls /api/mux/status until ready, then calls THIS route
 *      with { mux_asset_id, campaign_tag }.
 *
 * We resolve the playback_id from Mux, then insert the row with:
 *   - kind: 'quest_asset'
 *   - storage_key: <playback_id>   (so getMuxStreamUrl/Thumbnail/Download can pick it up)
 *   - url: <thumbnail URL>         (used as the grid thumbnail)
 *   - mime_type: 'video/mp4'       (so isVideo branches in the rotation engine)
 *   - tags: [campaign_tag]
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json().catch(() => null);
    const muxAssetId =
      typeof body?.mux_asset_id === "string" ? body.mux_asset_id : "";
    if (!muxAssetId) {
      return NextResponse.json(
        { error: "mux_asset_id is required" },
        { status: 400 }
      );
    }

    const rawTag = typeof body?.campaign_tag === "string" ? body.campaign_tag : "";
    if (!rawTag) {
      return NextResponse.json(
        { error: "campaign_tag is required" },
        { status: 400 }
      );
    }
    const tag = isValidCampaignTag(rawTag) ? rawTag : slugifyCampaignLabel(rawTag);
    if (!tag) {
      return NextResponse.json(
        { error: "campaign_tag must be a valid slug or label" },
        { status: 400 }
      );
    }

    const mux = getMuxClient();
    if (!mux) {
      return NextResponse.json(
        { error: "Mux not configured" },
        { status: 503 }
      );
    }

    const asset = await mux.video.assets.retrieve(muxAssetId);
    if (asset.status !== "ready") {
      return NextResponse.json(
        {
          error: "Mux asset is still processing",
          status: asset.status,
          code: "asset_not_ready",
        },
        { status: 409 }
      );
    }

    const playbackId = asset.playback_ids?.find(
      (p) => p.policy === "public"
    )?.id;
    if (!playbackId) {
      return NextResponse.json(
        { error: "Mux asset has no public playback id" },
        { status: 502 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: row, error: insertErr } = await db
      .from("tenant_media")
      .insert({
        org_id: orgId,
        kind: "quest_asset",
        kinds: ["quest_asset"],
        source: "upload",
        url: `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`,
        storage_key: playbackId,
        mime_type: "video/mp4",
        width: asset.aspect_ratio
          ? Math.round(1080 * Number(asset.aspect_ratio.split(":")[0])) /
            Number(asset.aspect_ratio.split(":")[1])
          : 1080,
        height: 1080,
        tags: [tag],
        created_by_user_id: auth.user.id,
      })
      .select("id, url, storage_key, mime_type, tags, created_at")
      .single();

    if (insertErr || !row) {
      Sentry.captureException(insertErr ?? new Error("no row inserted"), {
        extra: { orgId, muxAssetId, tag },
      });
      return NextResponse.json(
        { error: "Failed to record video" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: row });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/complete-video] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
