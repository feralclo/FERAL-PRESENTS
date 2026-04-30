import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import {
  slugifyCampaignLabel,
  isValidCampaignTag,
} from "@/lib/library/campaign-tag";
import * as Sentry from "@sentry/nextjs";

/**
 * PATCH /api/admin/media/campaigns/[tag]
 * Body: { label: string } — rename a campaign.
 *
 * Rewrites:
 *   1. `tenant_media.tags[0]` for every asset in the campaign (org-scoped).
 *   2. `rep_quests.asset_campaign_tag` for every quest pulling from it.
 *   3. The corresponding entry in `{org_id}_library_empty_campaigns` (if
 *      reserved before any upload happened).
 *
 * No quest references a stale tag mid-rename — we update quests after
 * media so a partial failure leaves quests pointing at the old tag (which
 * still has its assets) rather than a new tag with zero assets.
 *
 * DELETE /api/admin/media/campaigns/[tag]
 *   - Refuses if any rep_quests still reference the campaign (409).
 *   - With ?cascade=move (default): clears `tags[0]` on every asset
 *     (moves to "All assets"), preserves other tags, removes the empty-
 *     campaign reservation if present.
 *   - With ?cascade=delete: soft-deletes every asset (sets `deleted_at`).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { tag: oldTag } = await params;
    if (!isValidCampaignTag(oldTag)) {
      return NextResponse.json(
        { error: "Invalid campaign tag", code: "invalid_tag" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const label = (body?.label ?? "").toString().trim();
    if (!label || label.length > 80) {
      return NextResponse.json(
        { error: "label is required and must be 80 chars or fewer" },
        { status: 400 }
      );
    }
    const newTag = slugifyCampaignLabel(label);
    if (!newTag) {
      return NextResponse.json(
        { error: "Pick a name with at least one letter or number" },
        { status: 400 }
      );
    }

    if (newTag === oldTag) {
      // Just a label change with no slug delta — only update the
      // empty-campaign reservation if it exists.
      await touchLabelOnly(orgId, oldTag, label);
      return NextResponse.json({
        data: { tag: newTag, label },
        unchanged: true,
      });
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Verify the new slug isn't already in use within this tenant.
    const { count: collisionCount } = await db
      .from("tenant_media")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("kind", "quest_asset")
      .is("deleted_at", null)
      .contains("tags", [newTag]);
    if ((collisionCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "A campaign with that name already exists",
          code: "tag_already_exists",
        },
        { status: 409 }
      );
    }

    // 1. Rewrite tenant_media tags. We can't do an array slice in one
    //    go via PostgREST; pull the affected rows and rewrite each.
    const { data: rows } = await db
      .from("tenant_media")
      .select("id, tags")
      .eq("org_id", orgId)
      .eq("kind", "quest_asset")
      .is("deleted_at", null)
      .contains("tags", [oldTag]);

    for (const row of (rows ?? []) as Array<{ id: string; tags: string[] }>) {
      const newTags = (row.tags ?? []).map((t) => (t === oldTag ? newTag : t));
      const { error: updateErr } = await db
        .from("tenant_media")
        .update({ tags: newTags })
        .eq("id", row.id);
      if (updateErr) {
        Sentry.captureException(updateErr, { extra: { orgId, oldTag, newTag, rowId: row.id } });
        return NextResponse.json(
          { error: "Failed to rename campaign" },
          { status: 500 }
        );
      }
    }

    // 2. Update every linked rep_quests row.
    await db
      .from("rep_quests")
      .update({ asset_campaign_tag: newTag })
      .eq("asset_mode", "pool")
      .eq("asset_campaign_tag", oldTag);

    // 3. Update the empty-campaign reservation if present.
    await renameInEmptyCampaigns(orgId, oldTag, newTag, label);

    return NextResponse.json({ data: { tag: newTag, label } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/campaigns/[tag] PATCH] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
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

    const url = new URL(request.url);
    const cascade = url.searchParams.get("cascade") === "delete" ? "delete" : "move";

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Refuse if any quest still references this campaign — caller must
    // detach the quests first (the rail's right-click menu disables the
    // delete action when this is the case, so this is a safety net).
    const { data: linked } = await db
      .from("rep_quests")
      .select("id, title")
      .eq("asset_mode", "pool")
      .eq("asset_campaign_tag", tag)
      .limit(20);
    if ((linked ?? []).length > 0) {
      return NextResponse.json(
        {
          error: "Quests still pull from this campaign — update them first",
          code: "campaign_has_linked_quests",
          linked_quests: linked,
        },
        { status: 409 }
      );
    }

    // Pull the affected media rows.
    const { data: rows } = await db
      .from("tenant_media")
      .select("id, tags")
      .eq("org_id", orgId)
      .eq("kind", "quest_asset")
      .is("deleted_at", null)
      .contains("tags", [tag]);

    if (cascade === "delete") {
      const ids = (rows ?? []).map((r) => r.id);
      if (ids.length > 0) {
        const { error: delErr } = await db
          .from("tenant_media")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", ids);
        if (delErr) throw delErr;
      }
    } else {
      // Move-to-All-assets: strip `tag` from `tags`. Preserve other tags
      // (campaigns the asset also belonged to — rare but possible).
      for (const row of (rows ?? []) as Array<{ id: string; tags: string[] }>) {
        const newTags = (row.tags ?? []).filter((t) => t !== tag);
        await db.from("tenant_media").update({ tags: newTags }).eq("id", row.id);
      }
    }

    // Drop from the empty-campaign reservation if present.
    await removeFromEmptyCampaigns(orgId, tag);

    return NextResponse.json({ data: { tag, cascade, affected: rows?.length ?? 0 } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/campaigns/[tag] DELETE] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Empty-campaign reservation helpers (settings-side)
// ---------------------------------------------------------------------------

type EmptyCampaign = { tag: string; label: string; created_at: string };

async function loadEmptyCampaigns(orgId: string): Promise<EmptyCampaign[]> {
  const db = await getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("site_settings")
    .select("data")
    .eq("key", `${orgId}_library_empty_campaigns`)
    .maybeSingle();
  return (data?.data as EmptyCampaign[] | null) ?? [];
}

async function writeEmptyCampaigns(
  orgId: string,
  list: EmptyCampaign[]
): Promise<void> {
  const db = await getSupabaseAdmin();
  if (!db) return;
  await db
    .from("site_settings")
    .upsert(
      {
        key: `${orgId}_library_empty_campaigns`,
        data: list,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
}

async function touchLabelOnly(orgId: string, tag: string, label: string) {
  const list = await loadEmptyCampaigns(orgId);
  const idx = list.findIndex((l) => l.tag === tag);
  if (idx === -1) return;
  list[idx] = { ...list[idx], label };
  await writeEmptyCampaigns(orgId, list);
}

async function renameInEmptyCampaigns(
  orgId: string,
  oldTag: string,
  newTag: string,
  label: string
) {
  const list = await loadEmptyCampaigns(orgId);
  const idx = list.findIndex((l) => l.tag === oldTag);
  if (idx === -1) return;
  list[idx] = { ...list[idx], tag: newTag, label };
  await writeEmptyCampaigns(orgId, list);
}

async function removeFromEmptyCampaigns(orgId: string, tag: string) {
  const list = await loadEmptyCampaigns(orgId);
  const next = list.filter((l) => l.tag !== tag);
  if (next.length === list.length) return;
  await writeEmptyCampaigns(orgId, next);
}
