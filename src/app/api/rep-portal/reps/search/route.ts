import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * GET /api/rep-portal/reps/search
 *
 * Platform-wide rep search — finds friends across orgs by `display_name`,
 * `first_name`, or `last_name`. Mirrors `/api/promoters/discover`'s shape;
 * the rep social graph is platform-wide so search needs the same
 * surface area.
 *
 * Auth: `requireRepAuth()` — bearer token (mobile) or cookie (web v1).
 *
 * Query params:
 *   ?q=        substring filter, ILIKE against display_name + first/last_name
 *   ?limit=20  1..50 (default 20)
 *   ?offset=0  pagination cursor
 *
 * Response shape:
 *   {
 *     data: Array<{
 *       id, display_name, first_name, last_name, photo_url, level,
 *       xp_total, follower_count, following_count,
 *       i_follow_them, is_following_me
 *     }>,
 *     pagination: { limit, offset, has_more, total }
 *   }
 *
 * Filters:
 *   - status='active' (no deleted / suspended / pending)
 *   - excludes the searcher themselves
 *   - excludes both directions of `rep_blocks` (CLAUDE.md: read paths must
 *     OR-check both directions to hide content)
 *
 * Privacy: only public-profile fields surface — no email, phone, DOB, or
 * the auth_user_id link. Reps signed up knowing their profile is public.
 */

// 50/min/IP keeps the discovery surface from being scraped while leaving
// plenty of room for typeahead-style searches from a real user.
const limiter = createRateLimiter("rep-portal-reps-search", {
  limit: 50,
  windowSeconds: 60,
});

interface RepRow {
  id: string;
  display_name: string | null;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  level: number;
  points_balance: number;
  follower_count: number;
  following_count: number;
}

interface BlockRow {
  blocker_rep_id: string;
  blocked_rep_id: string;
}

interface FollowRow {
  follower_id: string;
  followee_id: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;
    const myRepId = auth.rep.id;

    const blocked = limiter(request);
    if (blocked) return blocked;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(50, Number.isNaN(rawLimit) ? 20 : rawLimit));
    const offset = Math.max(0, Number.isNaN(rawOffset) ? 0 : rawOffset);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Bidirectional block exclusion. One round-trip pulls every block row
    // touching the searcher so we can build a single excluded-id set
    // before the main query.
    const { data: blockRows } = await db
      .from("rep_blocks")
      .select("blocker_rep_id, blocked_rep_id")
      .or(`blocker_rep_id.eq.${myRepId},blocked_rep_id.eq.${myRepId}`);

    const excludedIds = new Set<string>([myRepId]);
    for (const row of (blockRows ?? []) as BlockRow[]) {
      excludedIds.add(
        row.blocker_rep_id === myRepId ? row.blocked_rep_id : row.blocker_rep_id
      );
    }

    let query = db
      .from("reps")
      .select(
        "id, display_name, first_name, last_name, photo_url, level, points_balance, follower_count, following_count",
        { count: "exact" }
      )
      .eq("status", "active");

    if (q.length > 0) {
      // Escape ILIKE metacharacters belt-and-braces — Supabase-js
      // parameterises but `q` is user input.
      const safeQ = q.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(
        `display_name.ilike.%${safeQ}%,first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%`
      );
    }

    if (excludedIds.size > 0) {
      // PostgREST `not.in.(uuid1,uuid2,...)` — UUIDs don't need quoting.
      const inClause = `(${Array.from(excludedIds).join(",")})`;
      query = query.not("id", "in", inClause);
    }

    // Order by display_name so results are stable across pages. Reps
    // without a display_name sink to the end (uncommon — set on signup).
    query = query
      .order("display_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true })
      .range(offset, offset + limit - 1);

    const { data: reps, count, error } = await query;

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const repList = (reps ?? []) as RepRow[];
    const repIds = repList.map((r) => r.id);

    // Follow flags scoped to this page only — two queries fired in
    // parallel, each one filtered to the result set so payloads stay tiny.
    const iFollow = new Set<string>();
    const followsMe = new Set<string>();

    if (repIds.length > 0) {
      const [outgoing, incoming] = await Promise.all([
        db
          .from("rep_follows")
          .select("followee_id")
          .eq("follower_id", myRepId)
          .in("followee_id", repIds),
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("followee_id", myRepId)
          .in("follower_id", repIds),
      ]);

      for (const row of (outgoing.data ?? []) as Pick<FollowRow, "followee_id">[]) {
        iFollow.add(row.followee_id);
      }
      for (const row of (incoming.data ?? []) as Pick<FollowRow, "follower_id">[]) {
        followsMe.add(row.follower_id);
      }
    }

    const data = repList.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      first_name: r.first_name,
      last_name: r.last_name,
      photo_url: r.photo_url,
      level: r.level,
      xp_total: r.points_balance,
      follower_count: r.follower_count,
      following_count: r.following_count,
      i_follow_them: iFollow.has(r.id),
      is_following_me: followsMe.has(r.id),
    }));

    const total = count ?? 0;
    return NextResponse.json({
      data,
      pagination: {
        limit,
        offset,
        has_more: offset + limit < total,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reps/search] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
