import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import {
  isTenantMediaKind,
  TENANT_MEDIA_KINDS,
} from "@/lib/uploads/tenant-media-config";

/**
 * GET /api/admin/media — list the tenant's media library.
 *
 * Query params (all optional):
 *   kind=all|quest_cover|event_cover|reward_cover|generic   default: all
 *   group=<name>     restrict to covers tagged with this group
 *   sort=recent|popular                                      default: recent
 *
 * Returns:
 *   data: rows enriched with `usage_count` (live-counted from rep_quests +
 *         events tables — no triggers, no drift)
 *   groups: distinct group names with counts ({ name, count, kinds: [] })
 *
 * Convention: a media row's "group" is the FIRST entry in its `tags` array.
 * Other entries are reserved for future labels — keep the array shape so
 * we don't migrate when we surface multi-tag in a year.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const url = request.nextUrl;
    const kindParam = url.searchParams.get("kind") || "all";
    const allKinds = kindParam === "all";
    if (!allKinds && !isTenantMediaKind(kindParam)) {
      return NextResponse.json(
        { error: "kind must be 'all' or one of: " + Object.keys(TENANT_MEDIA_KINDS).join(", ") },
        { status: 400 }
      );
    }
    const groupFilter = url.searchParams.get("group");
    const sort = url.searchParams.get("sort") === "popular" ? "popular" : "recent";

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let query = db
      .from("tenant_media")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!allKinds) query = query.eq("kind", kindParam);
    if (groupFilter) query = query.contains("tags", [groupFilter]);

    const { data: rows, error } = await query;

    if (error) {
      Sentry.captureException(error, { extra: { orgId, kind: kindParam } });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Usage counts ───────────────────────────────────────────────────
    // Quest covers come from rep_quests.cover_image_url; event covers
    // come from events.cover_image_url. We split the URL list by the
    // owning row's kind and run one query each. Cheap at our scale.
    const usageMap = new Map<string, number>();
    const questUrls = (rows ?? [])
      .filter((r) => r.kind === "quest_cover")
      .map((r) => r.url);
    const eventUrls = (rows ?? [])
      .filter((r) => r.kind === "event_cover")
      .map((r) => r.url);

    if (questUrls.length) {
      const { data: counts } = await db
        .from("rep_quests")
        .select("cover_image_url")
        .eq("org_id", orgId)
        .in("cover_image_url", questUrls);
      for (const row of counts ?? []) {
        const u = row.cover_image_url as string | null;
        if (u) usageMap.set(u, (usageMap.get(u) ?? 0) + 1);
      }
    }
    if (eventUrls.length) {
      const { data: counts } = await db
        .from("events")
        .select("cover_image_url")
        .eq("org_id", orgId)
        .in("cover_image_url", eventUrls);
      for (const row of counts ?? []) {
        const u = row.cover_image_url as string | null;
        if (u) usageMap.set(u, (usageMap.get(u) ?? 0) + 1);
      }
    }

    const enriched = (rows ?? []).map((r) => ({
      ...r,
      usage_count: usageMap.get(r.url) ?? 0,
      group: Array.isArray(r.tags) && r.tags.length ? (r.tags[0] as string) : null,
    }));

    if (sort === "popular") {
      enriched.sort(
        (a, b) =>
          b.usage_count - a.usage_count ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    // ── Groups summary ─────────────────────────────────────────────────
    // Distinct group names present in this view, with counts. Drives the
    // filter-chip row in the library UI. Includes all kinds in the org so
    // chips stay stable when admin toggles the kind filter.
    const groupsMap = new Map<string, number>();
    for (const r of enriched) {
      if (r.group) groupsMap.set(r.group, (groupsMap.get(r.group) ?? 0) + 1);
    }
    const groups = Array.from(groupsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return NextResponse.json({ data: enriched, groups });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
