import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import { getRotatedAssetsForRep } from "@/lib/library/asset-rotation";
import { resolveQuestOrgId } from "@/lib/library/quest-org";
import type { QuestAssetsResponse } from "@/types/library-campaigns";
import * as Sentry from "@sentry/nextjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/rep-portal/quests/[id]/assets
 *
 * Returns up to 10 assets from the quest's campaign, server-sorted to
 * keep the rep's feed feeling fresh:
 *   1. Assets the rep has never downloaded — newest upload first.
 *   2. Assets the rep has downloaded — longest-ago use first.
 *
 * Auth: rep only. Quest must be in pool mode and either belong to a
 * promoter the rep has an approved membership with, or be platform-level
 * (promoter_id IS NULL). Multi-tenant boundary is enforced by the rep's
 * membership scope — no cross-org leakage possible.
 *
 * iOS contract: docs/ios-quest-pool-contract.md (locked).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: questId } = await params;
    if (!questId || !UUID_RE.test(questId)) {
      return NextResponse.json(
        { error: "Invalid quest id", code: "invalid_quest_id" },
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

    // 1. Quest lookup. We need org_id (for the campaign query),
    //    asset_mode (must be 'pool'), asset_campaign_tag (the slug to
    //    match), promoter_id (auth scope), and event.org_id as a
    //    fallback for legacy rows where rep_quests.org_id might be
    //    misaligned (defensive — the schema sets a default).
    const { data: quest } = await db
      .from("rep_quests")
      .select(
        "id, org_id, asset_mode, asset_campaign_tag, promoter_id, status, event:events(org_id), promoter:promoters(org_id)"
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

    // 2. Auth scope — promoter membership for promoter-scoped quests.
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

    // 3. Resolve the org_id for the campaign query. Cascade in order
    //    of authority: the quest's own org_id (always populated for
    //    new rows), then the linked event, then the linked promoter.
    //    Legacy rows where every signal is null fall through to a
    //    quest_not_anchored error — but the cascade handles every
    //    quest created via the admin since the campaign feature
    //    shipped, including platform-level pool quests.
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

    // 4. Build the rotation slice.
    const result = await getRotatedAssetsForRep(db, {
      orgId,
      repId: auth.rep.id,
      campaignTag: quest.asset_campaign_tag,
      limit: 10,
    });

    // 5. Resolve the campaign label. We don't store the human label —
    //    derive it from the slug for now (admin UI keeps the original
    //    label in app state; here we de-slug as a sensible best effort).
    const label = unslugify(quest.asset_campaign_tag);

    const body: QuestAssetsResponse = {
      data: result.data,
      campaign: {
        label,
        total_in_pool: result.total_in_pool,
      },
      rotation_position: result.rotation_position,
    };
    return NextResponse.json(body);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/quests/[id]/assets] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Best-effort de-slug for the rep-facing campaign label. Tenants who
 * want a polished label upload it via the admin UI which keeps the
 * original casing in `tenant_media.tags[1]` (future enhancement). For
 * v1 this gives "Only Numbers Spring 26" from "only-numbers-spring-26"
 * which is acceptable.
 */
function unslugify(tag: string): string {
  return tag
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

