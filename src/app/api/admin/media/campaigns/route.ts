import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { slugifyCampaignLabel } from "@/lib/library/campaign-tag";
import type { CampaignSummary } from "@/types/library-campaigns";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/media/campaigns
 *
 * List every campaign in the tenant's library, with counts:
 *   - asset_count, image_count, video_count
 *   - linked_quest_count (how many rep_quests pull from this campaign)
 *   - first_seen_at (created_at of the campaign's oldest asset)
 *
 * Convention: a campaign is the set of `tenant_media` rows where
 * `kind = 'quest_asset'` AND `tags[0]` is the campaign slug. Display
 * labels are derived from the slug client-side; rename is supported by
 * a separate PATCH endpoint that rewrites `tags[]` + `rep_quests.asset_campaign_tag`
 * atomically.
 *
 * POST /api/admin/media/campaigns
 *
 * Create an empty campaign — there are no rows in `tenant_media` yet but
 * the slug is reserved by registering it on the tenant's settings (so the
 * rail surfaces it before the first upload). Body: { label: string }.
 * Idempotent: returns the existing campaign if the slug already exists.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // 1. Pull every campaign-tagged asset for the tenant. Pool sizes are
    //    small enough at our scale that a single SELECT beats per-tag
    //    counts. We bucket client-side.
    const { data: assets } = await db
      .from("tenant_media")
      .select("id, mime_type, tags, created_at")
      .eq("org_id", orgId)
      .eq("kind", "quest_asset")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    type AssetRow = {
      id: string;
      mime_type: string | null;
      tags: string[] | null;
      created_at: string;
    };

    type Bucket = {
      tag: string;
      asset_count: number;
      image_count: number;
      video_count: number;
      first_seen_at: string;
    };
    const buckets = new Map<string, Bucket>();
    for (const a of (assets ?? []) as AssetRow[]) {
      const tag = (a.tags ?? [])[0];
      if (!tag) continue;
      const isVideo = (a.mime_type ?? "").startsWith("video/");
      const existing = buckets.get(tag);
      if (existing) {
        existing.asset_count += 1;
        if (isVideo) existing.video_count += 1;
        else existing.image_count += 1;
        // first_seen_at = the *oldest* created_at, but assets came back
        // newest-first so the last seen entry per bucket is oldest.
        existing.first_seen_at = a.created_at;
      } else {
        buckets.set(tag, {
          tag,
          asset_count: 1,
          image_count: isVideo ? 0 : 1,
          video_count: isVideo ? 1 : 0,
          first_seen_at: a.created_at,
        });
      }
    }

    // 2. Linked-quest counts in one query.
    const tags = Array.from(buckets.keys());
    const linkedQuestCountByTag = new Map<string, number>();
    if (tags.length > 0) {
      const { data: quests } = await db
        .from("rep_quests")
        .select("asset_campaign_tag")
        .eq("asset_mode", "pool")
        .in("asset_campaign_tag", tags);
      for (const row of (quests ?? []) as Array<{
        asset_campaign_tag: string | null;
      }>) {
        if (!row.asset_campaign_tag) continue;
        linkedQuestCountByTag.set(
          row.asset_campaign_tag,
          (linkedQuestCountByTag.get(row.asset_campaign_tag) ?? 0) + 1
        );
      }
    }

    // 3. Pull "empty" campaigns the tenant has reserved (settings-side)
    //    so the rail can surface them even before the first upload. Stored
    //    as `{org_id}_library_empty_campaigns` in site_settings — see the
    //    POST handler below.
    const { data: settingsRow } = await db
      .from("site_settings")
      .select("data")
      .eq("key", `${orgId}_library_empty_campaigns`)
      .maybeSingle();

    const emptyCampaigns =
      (settingsRow?.data as { tag: string; label: string; created_at: string }[] | null) ?? [];
    for (const ec of emptyCampaigns) {
      if (buckets.has(ec.tag)) continue;
      buckets.set(ec.tag, {
        tag: ec.tag,
        asset_count: 0,
        image_count: 0,
        video_count: 0,
        first_seen_at: ec.created_at,
      });
    }

    // 4. Project to the API shape, newest-first.
    const labelByTag = new Map<string, string>();
    for (const ec of emptyCampaigns) {
      labelByTag.set(ec.tag, ec.label);
    }

    const data: CampaignSummary[] = Array.from(buckets.values())
      .sort(
        (a, b) =>
          new Date(b.first_seen_at).getTime() -
          new Date(a.first_seen_at).getTime()
      )
      .map((b) => ({
        tag: b.tag,
        label: labelByTag.get(b.tag) ?? unslugify(b.tag),
        asset_count: b.asset_count,
        image_count: b.image_count,
        video_count: b.video_count,
        linked_quest_count: linkedQuestCountByTag.get(b.tag) ?? 0,
        first_seen_at: b.first_seen_at,
      }));

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/campaigns GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json().catch(() => null);
    const label = (body?.label ?? "").toString().trim();
    if (!label || label.length > 80) {
      return NextResponse.json(
        { error: "label is required and must be 80 chars or fewer" },
        { status: 400 }
      );
    }
    const tag = slugifyCampaignLabel(label);
    if (!tag) {
      return NextResponse.json(
        { error: "Pick a name with at least one letter or number" },
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

    // Reserve the slug + label in site_settings under the platform's
    // existing JSONB convention (key encodes the org). We don't write
    // a placeholder `tenant_media` row because the table is
    // intentionally just a record of real uploads — orphan rows would
    // muddle every query.
    const settingsKey = `${orgId}_library_empty_campaigns`;
    const { data: existing } = await db
      .from("site_settings")
      .select("data")
      .eq("key", settingsKey)
      .maybeSingle();

    const list =
      ((existing?.data as { tag: string; label: string; created_at: string }[]) ??
        []) ?? [];
    const already = list.find((l) => l.tag === tag);
    if (already) {
      return NextResponse.json({
        data: { tag: already.tag, label: already.label, created_at: already.created_at },
        idempotent: true,
      });
    }
    const created_at = new Date().toISOString();
    list.push({ tag, label, created_at });

    const { error: writeErr } = await db
      .from("site_settings")
      .upsert(
        { key: settingsKey, data: list, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (writeErr) {
      Sentry.captureException(writeErr, { extra: { orgId, tag } });
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { tag, label, created_at },
      idempotent: false,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/campaigns POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function unslugify(tag: string): string {
  return tag
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
