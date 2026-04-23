import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getPlatformXPConfig } from "@/lib/rep-points";
import { getTierName, DEFAULT_TIERS } from "@/lib/xp-levels";
import type { TierDefinition } from "@/lib/xp-levels";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/leaderboard/
 *
 * Two shapes live here:
 *
 *  1. **Native spec (v2)** — when `?scope=friends|team|global` is present.
 *     Returns the full leaderboard payload described in the iOS leaderboard
 *     contract (scope/window/team_id, my_position, top_rows, around_me,
 *     delta_week). Used by the iOS LeaderboardScreen.
 *
 *  2. **Legacy web-portal shape** — when `scope` is absent. Returns the
 *     simpler global-or-event leaderboard that the frozen /rep/* web
 *     portal (src/app/rep/leaderboard/page.tsx) still calls. Keep this
 *     alive until the web portal is rebuilt post-iOS launch.
 */
export async function GET(request: NextRequest) {
  const scopeRaw = request.nextUrl.searchParams.get("scope");
  if (scopeRaw) return handleV2(request);
  return handleLegacy(request);
}

// ───────────────────────────────────────────────────────────────────────────
// v2 — iOS leaderboard contract
// ───────────────────────────────────────────────────────────────────────────

type Scope = "friends" | "team" | "global";
type WindowKey = "week" | "30d" | "alltime";

interface RepRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  level: number | null;
  created_at: string;
}

interface RankedRow {
  rep: RepRow;
  xp_period: number;
  rank: number;
}

/**
 * Curated palette for deterministic avatar background colour. We don't
 * store avatar_bg_hex per-rep (only promoters have it) — iOS needs a
 * value so the initials chip renders consistently. Deriving from rep_id
 * keeps it stable across clients. Returned as a decimal integer to
 * match the existing promoter DTO shape.
 */
const AVATAR_PALETTE = [
  0x6366f1, 0x8b5cf6, 0xa78bfa, 0xec4899, 0xf43f5e, 0xf97316, 0xf59e0b,
  0x10b981, 0x14b8a6, 0x06b6d4, 0x0ea5e9, 0x3b82f6, 0x4f46e5, 0xd946ef,
];

function avatarBgHexFor(repId: string): number {
  let h = 0;
  for (let i = 0; i < repId.length; i++) {
    h = (h * 31 + repId.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initialsFor(
  first: string | null,
  last: string | null,
  display: string | null
): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (f && l) return (f.charAt(0) + l.charAt(0)).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  const d = (display ?? "").trim();
  if (d) {
    const parts = d.split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return d.slice(0, 2).toUpperCase();
  }
  return "?";
}

function displayNameFor(rep: RepRow): string {
  if (rep.display_name?.trim()) return rep.display_name.trim();
  const full = [rep.first_name, rep.last_name].filter(Boolean).join(" ").trim();
  return full || "Rep";
}

function parseScope(v: string | null): Scope | null {
  return v === "friends" || v === "team" || v === "global" ? v : null;
}

function parseWindow(v: string | null): WindowKey | null {
  if (v == null) return "30d";
  return v === "week" || v === "30d" || v === "alltime" ? v : null;
}

function parseIntParam(v: string | null, def: number, min: number, max: number): number {
  if (v == null) return def;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

async function handleV2(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const me = auth.rep.id;
    const sp = request.nextUrl.searchParams;

    const scope = parseScope(sp.get("scope"));
    if (!scope) {
      return NextResponse.json(
        { error: "scope must be one of: friends, team, global" },
        { status: 400 }
      );
    }

    const windowKey = parseWindow(sp.get("window"));
    if (!windowKey) {
      return NextResponse.json(
        { error: "window must be one of: week, 30d, alltime" },
        { status: 400 }
      );
    }

    const teamId = sp.get("team_id");
    if (scope === "team" && !teamId) {
      return NextResponse.json(
        { error: "team_id is required when scope=team" },
        { status: 400 }
      );
    }

    const limit = parseIntParam(sp.get("limit"), 50, 1, 100);
    const offset = parseIntParam(sp.get("offset"), 0, 0, 1_000_000);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // 1. Resolve pool
    const poolRepIds = await resolvePool(db, me, scope, teamId);

    if (poolRepIds.length === 0) {
      return NextResponse.json({
        data: emptyPayload(scope, windowKey, teamId),
      });
    }

    // 2. Fetch rep rows for the pool
    const { data: repRowsRaw, error: repErr } = await db
      .from(TABLES.REPS)
      .select("id, first_name, last_name, display_name, photo_url, level, created_at, status")
      .in("id", poolRepIds);
    if (repErr) throw repErr;

    // Deleted reps are never ranked (App Store compliance — scrubbed accounts).
    const repRows: RepRow[] = (repRowsRaw ?? [])
      .filter((r) => (r as { status?: string }).status !== "deleted")
      .map((r) => ({
        id: r.id as string,
        first_name: (r as { first_name: string | null }).first_name,
        last_name: (r as { last_name: string | null }).last_name,
        display_name: (r as { display_name: string | null }).display_name,
        photo_url: (r as { photo_url: string | null }).photo_url,
        level: (r as { level: number | null }).level,
        created_at: (r as { created_at: string }).created_at,
      }));

    if (repRows.length === 0) {
      return NextResponse.json({
        data: emptyPayload(scope, windowKey, teamId),
      });
    }

    const rowIds = repRows.map((r) => r.id);

    // 3. Compute XP-in-window per rep
    const now = Date.now();
    const xpNow = await computeXpForPool(db, rowIds, windowKey, now);

    // 4. Rank (xp_period DESC, created_at ASC, sequential unique ranks)
    const ranked: RankedRow[] = repRows
      .map((rep) => ({ rep, xp_period: xpNow.get(rep.id) ?? 0, rank: 0 }))
      .sort((a, b) => {
        if (b.xp_period !== a.xp_period) return b.xp_period - a.xp_period;
        return (
          new Date(a.rep.created_at).getTime() -
          new Date(b.rep.created_at).getTime()
        );
      })
      .map((row, idx) => ({ ...row, rank: idx + 1 }));

    // 5. delta_week — always 0 for alltime. For week/30d, compute the
    //    rank snapshot as-of 7 days ago against the *same pool* and diff.
    const deltaByRep = new Map<string, number>();
    if (windowKey !== "alltime") {
      const sevenDaysAgo = now - 7 * 86_400_000;
      const xpPrev = await computeXpForPool(db, rowIds, windowKey, sevenDaysAgo);
      const prevRanked = repRows
        .map((rep) => ({ rep, xp_prev: xpPrev.get(rep.id) ?? 0 }))
        .sort((a, b) => {
          if (b.xp_prev !== a.xp_prev) return b.xp_prev - a.xp_prev;
          return (
            new Date(a.rep.created_at).getTime() -
            new Date(b.rep.created_at).getTime()
          );
        });
      const prevRankById = new Map<string, number>();
      prevRanked.forEach((row, idx) => prevRankById.set(row.rep.id, idx + 1));

      for (const row of ranked) {
        const prev = prevRankById.get(row.rep.id);
        if (prev != null) deltaByRep.set(row.rep.id, row.rank - prev);
      }
    }

    // 6. Build rows
    const platformConfig = await getPlatformXPConfig();
    const tiers: TierDefinition[] = platformConfig.tiers || DEFAULT_TIERS;

    const buildRow = (row: RankedRow) => ({
      rank: row.rank,
      rep_id: row.rep.id,
      display_name: displayNameFor(row.rep),
      initials: initialsFor(row.rep.first_name, row.rep.last_name, row.rep.display_name),
      avatar_bg_hex: avatarBgHexFor(row.rep.id),
      photo_url: row.rep.photo_url,
      level: row.rep.level ?? 1,
      tier: getTierName(row.rep.level ?? 1, tiers).toLowerCase(),
      xp_period: row.xp_period,
      delta_week: windowKey === "alltime" ? 0 : deltaByRep.get(row.rep.id) ?? 0,
    });

    const topRows = ranked.slice(offset, offset + limit).map(buildRow);

    const myRow = ranked.find((r) => r.rep.id === me) ?? null;
    // my_position.rank:
    //   - null when the requester isn't in the pool (e.g. scope=team and they
    //     aren't on that team, or scope=friends with no mutuals).
    //   - otherwise the real rank — zero-XP reps still get a rank within
    //     their pool (tied at the bottom by created_at). iOS decides
    //     whether to render "unranked" based on xp_period == 0.
    const myPosition = {
      rank: myRow?.rank ?? null,
      xp_period: myRow?.xp_period ?? 0,
      delta_week:
        windowKey === "alltime"
          ? 0
          : myRow
          ? deltaByRep.get(me) ?? 0
          : 0,
    };

    // around_me — 11-row window (5 above + self + 5 below) when the
    // requester is outside top_rows. Empty otherwise.
    let aroundMe: ReturnType<typeof buildRow>[] = [];
    if (myRow) {
      const inTopRows = myRow.rank > offset && myRow.rank <= offset + limit;
      if (!inTopRows) {
        const start = Math.max(0, myRow.rank - 6);
        const end = Math.min(ranked.length, myRow.rank + 5);
        aroundMe = ranked.slice(start, end).map(buildRow);
      }
    }

    return NextResponse.json({
      data: {
        scope,
        window: windowKey,
        team_id: teamId,
        total_ranked: ranked.length,
        my_position: myPosition,
        top_rows: topRows,
        around_me: aroundMe,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/leaderboard v2] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function emptyPayload(scope: Scope, windowKey: WindowKey, teamId: string | null) {
  return {
    scope,
    window: windowKey,
    team_id: teamId,
    total_ranked: 0,
    my_position: { rank: null, xp_period: 0, delta_week: 0 },
    top_rows: [],
    around_me: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Pool resolution
// ───────────────────────────────────────────────────────────────────────────

type Db = NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>;

async function resolvePool(
  db: Db,
  me: string,
  scope: Scope,
  teamId: string | null
): Promise<string[]> {
  if (scope === "global") {
    const { data } = await db
      .from(TABLES.REPS)
      .select("id")
      .in("status", ["active", "pending"]);
    return (data ?? []).map((r) => (r as { id: string }).id);
  }

  if (scope === "team") {
    const { data } = await db
      .from("rep_promoter_memberships")
      .select("rep_id")
      .eq("promoter_id", teamId!)
      .eq("status", "approved");
    return (data ?? []).map((r) => (r as { rep_id: string }).rep_id);
  }

  // friends — mutual follow. Pool includes the requester themselves
  // ("you're #3 of your 12 friends" per spec).
  const [outgoing, incoming] = await Promise.all([
    db.from("rep_follows").select("followee_id").eq("follower_id", me),
    db.from("rep_follows").select("follower_id").eq("followee_id", me),
  ]);
  const iFollow = new Set(
    ((outgoing.data ?? []) as Array<{ followee_id: string }>).map((r) => r.followee_id)
  );
  const followsMe = new Set(
    ((incoming.data ?? []) as Array<{ follower_id: string }>).map((r) => r.follower_id)
  );
  const mutuals: string[] = [];
  for (const id of iFollow) if (followsMe.has(id)) mutuals.push(id);
  if (mutuals.length === 0) return [];
  mutuals.push(me);
  return mutuals;
}

// ───────────────────────────────────────────────────────────────────────────
// XP aggregation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Sum of XP for each rep in the pool, bounded by the window.
 *
 * For `alltime` we read reps.points_balance directly (fastest; cumulative
 * lifetime balance). For `week` / `30d`, we aggregate rep_points_log
 * entries where created_at is within the window ending at `endMs`.
 *
 * Positive-only: refunds/revocations write negative ledger rows, and the
 * leaderboard tracks earnings not balance — counting negatives would let
 * two reps with very different activity look identical.
 */
async function computeXpForPool(
  db: Db,
  repIds: string[],
  windowKey: WindowKey,
  endMs: number
): Promise<Map<string, number>> {
  if (repIds.length === 0) return new Map();

  if (windowKey === "alltime") {
    // endMs is ignored for alltime — we report the full lifetime balance.
    const { data } = await db
      .from(TABLES.REPS)
      .select("id, points_balance")
      .in("id", repIds);
    const out = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ id: string; points_balance: number | null }>) {
      out.set(row.id, Math.max(0, row.points_balance ?? 0));
    }
    return out;
  }

  const days = windowKey === "week" ? 7 : 30;
  const startIso = new Date(endMs - days * 86_400_000).toISOString();
  const endIso = new Date(endMs).toISOString();

  // Single query — index (rep_id, created_at DESC) covers this well.
  // Supabase JS doesn't expose GROUP BY, so sum in-memory. For a 50K-row
  // window this is still cheap; it's the query that matters.
  const { data } = await db
    .from(TABLES.REP_POINTS_LOG)
    .select("rep_id, points")
    .in("rep_id", repIds)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .gt("points", 0);

  const out = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ rep_id: string; points: number }>) {
    out.set(row.rep_id, (out.get(row.rep_id) ?? 0) + (row.points ?? 0));
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Legacy shape — kept for the frozen /rep/* web portal
// ───────────────────────────────────────────────────────────────────────────

async function handleLegacy(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const eventId = request.nextUrl.searchParams.get("event_id");
    if (eventId) {
      return await getEventLeaderboard(supabase, repId, eventId, orgId);
    }

    const { data: reps, error } = await supabase
      .from(TABLES.REPS)
      .select("id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("total_revenue", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[rep-portal/leaderboard legacy] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 500 }
      );
    }

    const leaderboard = (reps || []).map(
      (r: Record<string, unknown>, index: number) => ({
        ...r,
        position: index + 1,
      })
    );

    const currentRepEntry = leaderboard.find(
      (r) => (r as Record<string, unknown>).id === repId
    );
    let currentPosition: number | null = currentRepEntry
      ? currentRepEntry.position
      : null;

    if (!currentRepEntry) {
      const { data: currentRep } = await supabase
        .from(TABLES.REPS)
        .select("total_revenue")
        .eq("id", repId)
        .eq("org_id", orgId)
        .single();

      if (currentRep && Number(currentRep.total_revenue) > 0) {
        const { count: ahead } = await supabase
          .from(TABLES.REPS)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "active")
          .gt("total_revenue", Number(currentRep.total_revenue));
        currentPosition = (ahead || 0) + 1;
      }
    }

    return NextResponse.json({
      data: {
        leaderboard,
        current_position: currentPosition,
        current_rep_id: repId,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/leaderboard legacy] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function getEventLeaderboard(
  supabase: Db,
  repId: string,
  eventId: string,
  orgId: string
) {
  const [leaderboardResult, eventResult, rewardsResult] = await Promise.all([
    supabase
      .from(TABLES.REP_EVENTS)
      .select(
        "rep_id, sales_count, revenue, rep:reps(id, display_name, first_name, last_name, photo_url, total_sales, total_revenue, level, status)"
      )
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .order("revenue", { ascending: false })
      .limit(200),
    supabase
      .from(TABLES.EVENTS)
      .select("id, name, date_start, status")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single(),
    supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .select("position, reward_name, reward_id, awarded_rep_id, xp_reward, currency_reward")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .order("position", { ascending: true }),
  ]);

  if (leaderboardResult.error) {
    console.error(
      "[rep-portal/leaderboard legacy] Event query error:",
      leaderboardResult.error
    );
    return NextResponse.json(
      { error: "Failed to fetch event leaderboard" },
      { status: 500 }
    );
  }

  const activeEntries = (leaderboardResult.data || []).filter(
    (re: Record<string, unknown>) => {
      const rep = re.rep as Record<string, unknown> | null;
      return rep?.status === "active";
    }
  );

  const leaderboard = activeEntries.slice(0, 50).map(
    (re: Record<string, unknown>, index: number) => {
      const rep = re.rep as Record<string, unknown> | null;
      return {
        id: rep?.id || re.rep_id,
        display_name: rep?.display_name || null,
        first_name: rep?.first_name || null,
        last_name: rep?.last_name || null,
        photo_url: rep?.photo_url || null,
        total_sales: re.sales_count,
        total_revenue: re.revenue,
        level: rep?.level || 1,
        position: index + 1,
      };
    }
  );

  const currentRepEntry = leaderboard.find((r) => r.id === repId);
  const currentPosition = currentRepEntry ? currentRepEntry.position : null;

  const positionRewards = (rewardsResult.data || []).map((pr) => ({
    position: pr.position as number,
    reward_name: pr.reward_name as string,
    reward_id: pr.reward_id as string | null,
    awarded_rep_id: pr.awarded_rep_id as string | null,
    xp_reward: (pr.xp_reward as number) || 0,
    currency_reward: (pr.currency_reward as number) || 0,
  }));

  const locked = positionRewards.some((pr) => pr.awarded_rep_id !== null);

  const event = eventResult.data as Record<string, unknown> | null;

  return NextResponse.json({
    data: {
      leaderboard,
      current_position: currentPosition,
      current_rep_id: repId,
      event_id: eventId,
      event: event
        ? {
            name: event.name as string,
            date_start: event.date_start as string | null,
            status: event.status as string,
          }
        : null,
      locked,
      position_rewards: positionRewards,
    },
  });
}
