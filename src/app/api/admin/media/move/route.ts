import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import {
  isValidCampaignTag,
  slugifyCampaignLabel,
} from "@/lib/library/campaign-tag";
import * as Sentry from "@sentry/nextjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/media/move
 *
 * Bulk-move tenant_media rows between campaigns. Body:
 *   {
 *     ids: string[],
 *     campaign_tag: string | null,    // null = strip the campaign tag (move to "All assets")
 *     campaign_label?: string         // optional label for a brand-new tag
 *   }
 *
 * Each row's `tags[0]` is replaced with `campaign_tag`. Any other tags
 * past index 0 are preserved (rare but possible — historic uploads may
 * have multi-tag).
 *
 * Side effect: when the destination tag isn't already represented in the
 * library, the row materialises a new campaign automatically (its asset
 * count goes from 0 → ids.length).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]) : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "ids must be a non-empty array" },
        { status: 400 }
      );
    }
    for (const id of ids) {
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        return NextResponse.json(
          { error: "ids must be UUIDs" },
          { status: 400 }
        );
      }
    }

    let targetTag: string | null = null;
    const rawTag = body?.campaign_tag;
    if (rawTag !== null && rawTag !== undefined) {
      if (typeof rawTag !== "string") {
        return NextResponse.json(
          { error: "campaign_tag must be a string or null" },
          { status: 400 }
        );
      }
      if (!isValidCampaignTag(rawTag)) {
        // Allow callers to pass a label and have us slugify — keeps the
        // UI calling code minimal.
        const slug = slugifyCampaignLabel(rawTag);
        if (!slug) {
          return NextResponse.json(
            { error: "campaign_tag must be a valid slug or label" },
            { status: 400 }
          );
        }
        targetTag = slug;
      } else {
        targetTag = rawTag;
      }
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Pull current rows scoped to this tenant — guards against
    // cross-tenant move attempts and gives us the existing tags array
    // to splice.
    const { data: rows } = await db
      .from("tenant_media")
      .select("id, tags, kinds")
      .eq("org_id", orgId)
      .in("id", ids as string[])
      .is("deleted_at", null);

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No matching rows", code: "no_rows" },
        { status: 404 }
      );
    }

    let succeeded = 0;
    for (const row of rows as Array<{
      id: string;
      tags: string[] | null;
      kinds: string[] | null;
    }>) {
      const rest = (row.tags ?? []).slice(1); // preserve everything past tags[0]
      const newTags = targetTag ? [targetTag, ...rest] : rest;
      // When a row joins a campaign, both the primary `kind` AND the
      // `kinds[]` array need to align. Filtering surfaces use the array
      // (multi-kind support), so a row with kind='quest_asset' but
      // kinds=['quest_cover'] would count toward the campaign's asset
      // total but never appear in its grid — exactly the drift this
      // route caused before the fix.
      const updates: {
        tags: string[];
        kind?: string;
        kinds?: string[];
      } = { tags: newTags };
      if (targetTag) {
        updates.kind = "quest_asset";
        const existing = row.kinds ?? [];
        // Replace kinds with ['quest_asset'] — the row is now part of a
        // campaign, that's its identity. If the host wants it to show
        // under the "Quest covers" filter chip too, they upload again or
        // duplicate; preserving the old kind silently leads to confusion.
        updates.kinds = ["quest_asset"];
        void existing;
      }

      const { error: updErr } = await db
        .from("tenant_media")
        .update(updates)
        .eq("id", row.id)
        .eq("org_id", orgId);
      if (updErr) {
        Sentry.captureException(updErr, {
          extra: { orgId, rowId: row.id, targetTag },
        });
        continue;
      }
      succeeded += 1;
    }

    return NextResponse.json({
      data: { moved: succeeded, target: targetTag, total: ids.length },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/media/move POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
