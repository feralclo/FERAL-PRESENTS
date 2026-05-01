import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import { recordAssetDownload } from "@/lib/library/asset-rotation";
import { getMuxDownloadUrl, isMuxPlaybackId } from "@/lib/mux";
import { resolveQuestOrgId } from "@/lib/library/quest-org";
import type { QuestAssetDownloadResponse } from "@/types/library-campaigns";
import * as Sentry from "@sentry/nextjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/rep-portal/quests/[id]/assets/[mediaId]/download
 *
 * Idempotent record of a rep's download + canonical asset URL.
 * - For images: returns the public storage URL (permanent, no expiry).
 * - For videos: returns a Mux capped-1080p MP4 URL the iOS app can save
 *   directly to PHPhotoLibrary.
 *
 * Cross-campaign abuse is blocked: the mediaId must be in the quest's
 * campaign AND in the same org. Multi-tenant boundary is enforced.
 *
 * iOS contract: docs/ios-quest-pool-contract.md (locked).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: questId, mediaId } = await params;
    if (!questId || !UUID_RE.test(questId)) {
      return NextResponse.json(
        { error: "Invalid quest id", code: "invalid_quest_id" },
        { status: 400 }
      );
    }
    if (!mediaId || !UUID_RE.test(mediaId)) {
      return NextResponse.json(
        { error: "Invalid media id", code: "invalid_media_id" },
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

    // 1. Quest lookup + auth scope (mirrors the GET assets route).
    const { data: quest } = await db
      .from("rep_quests")
      .select(
        "id, org_id, asset_mode, asset_campaign_tag, promoter_id, event:events(org_id), promoter:promoters(org_id)"
      )
      .eq("id", questId)
      .maybeSingle();

    if (!quest) {
      return NextResponse.json(
        { error: "Quest not found", code: "quest_not_found" },
        { status: 404 }
      );
    }

    if (quest.asset_mode !== "pool" || !quest.asset_campaign_tag) {
      return NextResponse.json(
        {
          error: "This quest does not pull from a campaign",
          code: "not_a_pool_quest",
        },
        { status: 400 }
      );
    }

    if (quest.promoter_id) {
      const { data: membership } = await db
        .from("rep_promoter_memberships")
        .select("status")
        .eq("rep_id", auth.rep.id)
        .eq("promoter_id", quest.promoter_id)
        .maybeSingle();
      if (!membership || membership.status !== "approved") {
        return NextResponse.json(
          {
            error: "You are not on this promoter's team",
            code: "not_on_team",
          },
          { status: 403 }
        );
      }
    }

    const orgId = resolveQuestOrgId(quest);
    if (!orgId) {
      return NextResponse.json(
        {
          error: "Quest is not anchored to an event or promoter",
          code: "quest_not_anchored",
        },
        { status: 400 }
      );
    }

    // 2. Verify the media is real, in the quest's campaign, in the same
    //    org, and not soft-deleted. Single SELECT does all four checks.
    const { data: media } = await db
      .from("tenant_media")
      .select("id, url, storage_key, mime_type, kind, tags, org_id, deleted_at")
      .eq("id", mediaId)
      .maybeSingle();

    if (!media || media.deleted_at) {
      return NextResponse.json(
        { error: "Media not found", code: "media_not_found" },
        { status: 404 }
      );
    }

    if (media.org_id !== orgId) {
      return NextResponse.json(
        { error: "Media not found", code: "media_not_found" },
        { status: 404 }
      );
    }

    const tags = (media.tags ?? []) as string[];
    if (
      media.kind !== "quest_asset" ||
      !tags.includes(quest.asset_campaign_tag)
    ) {
      return NextResponse.json(
        {
          error: "This asset is not in the quest's campaign",
          code: "media_not_in_quest_pool",
        },
        { status: 403 }
      );
    }

    // 3. Idempotent download log.
    const { first_time } = await recordAssetDownload(db, {
      orgId,
      repId: auth.rep.id,
      mediaId,
      questId,
    });

    // 4. Build the asset URL. Image = public canonical URL (permanent).
    //    Video = Mux capped-1080p MP4 (24h validity by default; we
    //    surface that to iOS so it can re-fetch on expiry).
    const isVideo = (media.mime_type ?? "").startsWith("video/");
    const muxId =
      isVideo && media.storage_key && isMuxPlaybackId(media.storage_key)
        ? media.storage_key
        : null;

    let url: string;
    let expires_at: string | null = null;
    if (muxId) {
      url = getMuxDownloadUrl(muxId);
      // Mux signed-URL TTL is configured per-asset; we use unsigned
      // capped-1080p which is permanent for the asset's lifetime, so
      // the contract's `expires_at` stays null. Clients should still
      // re-fetch on download failure rather than caching the URL
      // indefinitely.
      expires_at = null;
    } else {
      url = media.url;
      expires_at = null;
    }

    const body: QuestAssetDownloadResponse = {
      url,
      expires_at,
      first_time,
    };
    return NextResponse.json(body);
  } catch (err) {
    Sentry.captureException(err);
    console.error(
      "[rep-portal/quests/[id]/assets/[mediaId]/download] Error:",
      err
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
