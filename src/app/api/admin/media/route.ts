import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import { isTenantMediaKind } from "@/lib/uploads/tenant-media-config";

/**
 * GET /api/admin/media — list the tenant's media library.
 *
 * Query: ?kind=quest_cover (required) &limit=60 &offset=0 &sort=recent|popular
 *
 * Returns each media row plus `usage_count` — computed at read time by
 * counting rep_quests rows where cover_image_url matches this row's url.
 * No trigger, no stored counter, no drift.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const url = request.nextUrl;
    const kind = url.searchParams.get("kind") || "";
    if (!isTenantMediaKind(kind)) {
      return NextResponse.json(
        { error: "kind query param required (quest_cover|event_cover|reward_cover|generic)" },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "60", 10) || 60, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
    const sort = url.searchParams.get("sort") === "popular" ? "popular" : "recent";

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: rows, error } = await db
      .from("tenant_media")
      .select("*")
      .eq("org_id", orgId)
      .eq("kind", kind)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      Sentry.captureException(error, { extra: { orgId, kind } });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute usage_count for the returned page in a single query.
    const urls = (rows ?? []).map((r) => r.url);
    const usageMap = new Map<string, number>();
    if (urls.length && kind === "quest_cover") {
      const { data: counts } = await db
        .from("rep_quests")
        .select("cover_image_url")
        .eq("org_id", orgId)
        .in("cover_image_url", urls);
      for (const row of counts ?? []) {
        const u = row.cover_image_url as string | null;
        if (u) usageMap.set(u, (usageMap.get(u) ?? 0) + 1);
      }
    }

    const enriched = (rows ?? []).map((r) => ({
      ...r,
      usage_count: usageMap.get(r.url) ?? 0,
    }));

    // For "popular" sort, sort the page client-side after enrichment.
    // (True ranking would require a windowed query; this is fine at <200 rows.)
    if (sort === "popular") {
      enriched.sort(
        (a, b) =>
          b.usage_count - a.usage_count ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return NextResponse.json({ data: enriched });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
