import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/friends
 *
 * Mutual follows. A rep is "friends" with another when both A→B and B→A
 * follow rows exist in rep_follows. Computed on the fly — no dedicated
 * friends table (per spec decision 7).
 *
 * Query params:
 *   ?limit=50 (1..100)
 *   ?offset=0
 *
 * Response:
 *   {
 *     data: [{
 *       id, display_name, first_name, photo_url, initials,
 *       avatar_bg_hex, level, total_sales
 *     }],
 *     pagination: { limit, offset, has_more, total }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 50 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Two queries: who I follow, who follows me. Intersection = friends.
    const [followingResult, followersResult] = await Promise.all([
      db
        .from("rep_follows")
        .select("followee_id")
        .eq("follower_id", auth.rep.id),
      db
        .from("rep_follows")
        .select("follower_id")
        .eq("followee_id", auth.rep.id),
    ]);

    const following = new Set(
      ((followingResult.data ?? []) as Array<{ followee_id: string }>).map(
        (r) => r.followee_id
      )
    );
    const followers = new Set(
      ((followersResult.data ?? []) as Array<{ follower_id: string }>).map(
        (r) => r.follower_id
      )
    );

    const friendIds = [...following].filter((id) => followers.has(id));
    const total = friendIds.length;

    if (total === 0) {
      return NextResponse.json({
        data: [],
        pagination: { limit, offset, has_more: false, total: 0 },
      });
    }

    // Slice to the requested page and fetch public rep info only.
    const pageIds = friendIds.slice(offset, offset + limit);

    const { data: reps, error } = await db
      .from("reps")
      .select(
        "id, display_name, first_name, last_name, photo_url, level, total_sales"
      )
      .in("id", pageIds);

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json(
        { error: "Failed to load friends" },
        { status: 500 }
      );
    }

    type RepRow = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      photo_url: string | null;
      level: number | null;
      total_sales: number | null;
    };

    // Preserve the order from friendIds so pagination is stable.
    const rowById = new Map<string, RepRow>();
    for (const rep of (reps ?? []) as RepRow[]) {
      rowById.set(rep.id, rep);
    }

    const friends = pageIds
      .map((id) => rowById.get(id))
      .filter((r): r is RepRow => !!r)
      .map((rep) => {
        const initials =
          [rep.first_name, rep.last_name]
            .filter(Boolean)
            .map((n) => n!.charAt(0).toUpperCase())
            .join("")
            .slice(0, 2) ||
          (rep.display_name ?? "?").charAt(0).toUpperCase();

        return {
          id: rep.id,
          display_name: rep.display_name,
          first_name: rep.first_name,
          photo_url: rep.photo_url,
          initials,
          avatar_bg_hex: null, // reserved for rep branding (future)
          level: rep.level ?? 1,
          total_sales: rep.total_sales ?? 0,
        };
      });

    return NextResponse.json({
      data: friends,
      pagination: {
        limit,
        offset,
        has_more: offset + friends.length < total,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/friends] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
