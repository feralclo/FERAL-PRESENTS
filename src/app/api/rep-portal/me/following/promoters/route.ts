import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import { absolutizeUrl } from "@/lib/absolute-url";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/following/promoters
 *
 * Paginated list of promoters this rep follows. Separate endpoint from
 * dashboard.followed_promoters so iOS / web-v2 can fetch more beyond the
 * home-screen preview and paginate through all follows.
 *
 * Query params:
 *   ?limit=20 (default) — 1..50
 *   ?offset=0 (default)
 *
 * Response:
 *   {
 *     data: Promoter[],
 *     pagination: { limit, offset, has_more }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
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

    // Fetch approved memberships in one query so we can compute is_on_team
    // without N+1.
    const [followsResult, membershipsResult] = await Promise.all([
      db
        .from("rep_promoter_follows")
        .select(
          "created_at, promoter:promoters(id, handle, display_name, tagline, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, follower_count, team_size)",
          { count: "exact" }
        )
        .eq("rep_id", auth.rep.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      db
        .from("rep_promoter_memberships")
        .select("promoter_id")
        .eq("rep_id", auth.rep.id)
        .eq("status", "approved"),
    ]);

    type Promoter = {
      id: string;
      handle: string;
      display_name: string;
      tagline: string | null;
      accent_hex: number;
      avatar_url: string | null;
      avatar_initials: string | null;
      avatar_bg_hex: number | null;
      cover_image_url: string | null;
      follower_count: number;
      team_size: number;
    };
    type Row = {
      created_at: string;
      promoter: Promoter | Promoter[] | null;
    };

    const teamPromoterIds = new Set(
      ((membershipsResult.data ?? []) as Array<{ promoter_id: string }>).map(
        (m) => m.promoter_id
      )
    );

    const promoters = ((followsResult.data ?? []) as unknown as Row[])
      .map((row) => {
        const p = Array.isArray(row.promoter)
          ? row.promoter[0] ?? null
          : row.promoter;
        if (!p) return null;
        return {
          id: p.id,
          handle: p.handle,
          display_name: p.display_name,
          tagline: p.tagline,
          accent_hex: p.accent_hex,
          avatar_url: absolutizeUrl(p.avatar_url, request),
          avatar_initials: p.avatar_initials,
          avatar_bg_hex: p.avatar_bg_hex,
          cover_image_url: absolutizeUrl(p.cover_image_url, request),
          follower_count: p.follower_count,
          team_size: p.team_size,
          is_following: true,
          is_on_team: teamPromoterIds.has(p.id),
          followed_at: row.created_at,
        };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);

    const total = followsResult.count ?? promoters.length;
    const hasMore = offset + promoters.length < total;

    return NextResponse.json({
      data: promoters,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/following/promoters] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
