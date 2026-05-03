import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";
import { absolutizePromoterUrls } from "@/lib/absolute-url";
import * as Sentry from "@sentry/nextjs";

// Public endpoint — rate-limit to keep casual scrapers off.
// 60/min/IP is plenty for real user browsing.
const limiter = createRateLimiter("promoters-discover", {
  limit: 60,
  windowSeconds: 60,
});

/**
 * GET /api/promoters/discover
 *
 * Public discovery — search or browse promoters on the platform. Returns
 * only `visibility = 'public'` rows; private promoters never appear here
 * even with a search match.
 *
 * Query params:
 *   ?q=        substring filter against handle + display_name + location
 *   ?limit=20  1..50 (default 20)
 *   ?offset=0  pagination cursor
 *
 * Response: { data: Promoter[], pagination: { limit, offset, has_more, total } }
 */
export async function GET(request: NextRequest) {
  try {
    const blocked = limiter(request);
    if (blocked) return blocked;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    let query = db
      .from("promoters")
      .select(
        "id, handle, display_name, tagline, location, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, follower_count, team_size",
        { count: "exact" }
      )
      .eq("visibility", "public");

    if (q.length > 0) {
      // Escape Postgres ILIKE metacharacters — belt & braces, Supabase-js
      // parameterises anyway but q is user input.
      const safeQ = q.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(
        `handle.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%,location.ilike.%${safeQ}%`
      );
    }

    const { data, error, count } = await query
      .order("follower_count", { ascending: false })
      .order("team_size", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      Sentry.captureException(error, { extra: { q, limit, offset } });
      return NextResponse.json(
        { error: "Discovery failed" },
        { status: 500 }
      );
    }

    const promoters = (data ?? []).map((p) =>
      absolutizePromoterUrls(p as { avatar_url?: string | null; cover_image_url?: string | null }, request)
    );
    const total = count ?? promoters.length;

    return NextResponse.json({
      data: promoters,
      pagination: {
        limit,
        offset,
        has_more: offset + promoters.length < total,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[promoters/discover] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
