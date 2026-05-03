import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getPlatformXPConfig } from "@/lib/rep-points";
import {
  getLevelProgress,
  getTierName,
  DEFAULT_LEVELING,
  DEFAULT_TIERS,
} from "@/lib/xp-levels";
import type { LevelingConfig, TierDefinition } from "@/lib/xp-levels";
import { buildRepShareUrl, fetchPrimaryDomains } from "@/lib/rep-share-url";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/dashboard
 *
 * Aggregated home-screen payload for native clients (iOS / Android / web-v2).
 * Shape documented in ENTRY-IOS-BACKEND-SPEC.md §6.3.
 *
 * Query params:
 *   ?promoter_id=UUID — scope events / leaderboard / recent_sales to one
 *                       promoter. Omit for aggregate view across all
 *                       approved memberships.
 *   ?include=a,b,c   — comma-separated subset of top-level sections
 *                       (rep,xp,ep,leaderboard,story_rail,followed_promoters,
 *                        events,feed,recent_sales,featured_rewards,discount).
 *                       Default: all.
 *
 * Sections returning empty-but-present arrays in v1 (story_rail, feed,
 * featured_rewards) land in Phase 3 / Phase 4. followed_promoters and
 * events / recent_sales / leaderboard / discount are real from day one.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const isPending = auth.rep.status === "pending";

    const url = new URL(request.url);
    const promoterIdParam = url.searchParams.get("promoter_id") || null;
    const includeParam = url.searchParams.get("include");
    const includes = includeParam
      ? new Set(includeParam.split(",").map((s) => s.trim()).filter(Boolean))
      : null; // null = all sections
    const want = (section: string) => !includes || includes.has(section);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // ------------------------------------------------------------------
    // Step 1a: fetch full rep row (auth.rep is a thin shape)
    // ------------------------------------------------------------------
    const { data: repRow } = await db
      .from(TABLES.REPS)
      .select(
        "id, email, first_name, last_name, display_name, photo_url, banner_url, bio, instagram, tiktok, level, points_balance, currency_balance, total_sales, total_revenue, onboarding_completed, follower_count, following_count"
      )
      .eq("id", repId)
      .single();

    if (!repRow) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    type FullRep = {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
      photo_url: string | null;
      banner_url: string | null;
      bio: string | null;
      instagram: string | null;
      tiktok: string | null;
      level: number | null;
      points_balance: number | null;
      currency_balance: number | null;
      total_sales: number | null;
      total_revenue: number | null;
      onboarding_completed: boolean | null;
      follower_count: number | null;
      following_count: number | null;
    };
    const rep = repRow as unknown as FullRep;

    // ------------------------------------------------------------------
    // Step 1b: resolve scope — which promoters does this rep belong to?
    // ------------------------------------------------------------------
    const { data: membershipRows } = await db
      .from("rep_promoter_memberships")
      .select(
        "promoter_id, discount_code, discount_percent, promoter:promoters(id, org_id, handle, display_name, tagline, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, follower_count, team_size)"
      )
      .eq("rep_id", repId)
      .eq("status", "approved");

    type Promoter = {
      id: string;
      org_id: string;
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
    type Membership = {
      promoter_id: string;
      discount_code: string | null;
      discount_percent: number | null;
      promoter: Promoter | null;
    };

    // Supabase typings return joined relations as arrays even for 1:1 FKs.
    // Normalise by picking the first (or null) so downstream code gets a
    // single object it can reason about.
    const approvedMemberships: Membership[] = (
      (membershipRows ?? []) as unknown as Array<{
        promoter_id: string;
        discount_code: string | null;
        discount_percent: number | null;
        promoter: Promoter | Promoter[] | null;
      }>
    ).map((row) => ({
      promoter_id: row.promoter_id,
      discount_code: row.discount_code,
      discount_percent: row.discount_percent,
      promoter: Array.isArray(row.promoter)
        ? row.promoter[0] ?? null
        : row.promoter ?? null,
    }));

    // Apply ?promoter_id= filter to scope downstream queries
    const scopedMemberships = promoterIdParam
      ? approvedMemberships.filter((m) => m.promoter_id === promoterIdParam)
      : approvedMemberships;
    const scopedPromoterIds = scopedMemberships
      .map((m) => m.promoter_id)
      .filter(Boolean);
    const scopedOrgIds = scopedMemberships
      .map((m) => m.promoter?.org_id)
      .filter((s): s is string => !!s);

    // ------------------------------------------------------------------
    // Step 2: fan out everything in parallel
    // ------------------------------------------------------------------
    const [
      platformConfig,
      repPointsLogTodayResult,
      leaderboardResult,
      followedPromotersResult,
      eventsResult,
      recentSalesResult,
      approvedQuestCountResult,
      submissionsTodayResult,
    ] = await Promise.all([
      getPlatformXPConfig(),

      // XP earned today — for the `xp.today` field. Column is `points`,
      // NOT `points_delta` (a long-standing typo silently returned 0 for
      // everyone — surfaced while wiring streak.today_locked, fixed here).
      want("xp")
        ? db
            .from(TABLES.REP_POINTS_LOG)
            .select("points", { count: "exact" })
            .eq("rep_id", repId)
            .gte("created_at", startOfTodayIso())
        : Promise.resolve({ data: null, count: null }),

      // Leaderboard (for position + total) — scoped to first scoped org if set,
      // otherwise platform-wide across all approved orgs this rep belongs to.
      want("leaderboard") && scopedOrgIds.length > 0
        ? db
            .from(TABLES.REPS)
            .select("id, total_revenue", { count: "exact" })
            .in("org_id", scopedOrgIds)
            .eq("status", "active")
            .order("total_revenue", { ascending: false })
        : Promise.resolve({ data: [], count: 0 }),

      // Followed promoters
      want("followed_promoters")
        ? db
            .from("rep_promoter_follows")
            .select(
              "promoter:promoters(id, handle, display_name, tagline, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, follower_count, team_size)"
            )
            .eq("rep_id", repId)
        : Promise.resolve({ data: [] }),

      // Events — everything rep-enabled + live from scoped promoters (via their org_id)
      want("events") && scopedOrgIds.length > 0
        ? db
            .from(TABLES.EVENTS)
            .select(
              "id, org_id, name, slug, date_start, date_end, venue_name, city, country, status, cover_image, cover_image_url, poster_image_url, banner_image_url"
            )
            .in("org_id", scopedOrgIds)
            .eq("rep_enabled", true)
            .in("status", ["published", "active", "live"])
            .order("date_start", { ascending: true })
        : Promise.resolve({ data: [] }),

      // Recent sales — last 5 orders attributed to this rep
      want("recent_sales") && scopedOrgIds.length > 0
        ? db
            .from(TABLES.ORDERS)
            .select(
              "id, org_id, order_number, total, currency, status, metadata, created_at, event:events(id, name, slug)"
            )
            .in("org_id", scopedOrgIds)
            .eq("metadata->>rep_id", repId)
            .order("created_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),

      // Lifetime approved-quest count across every promoter team. iOS uses
      // `count == 1` to detect the first-ever approval (and fire its
      // celebration takeover) without relying on a UserDefaults flag that
      // would reset on reinstall.
      want("rep")
        ? db
            .from(TABLES.REP_QUEST_SUBMISSIONS)
            .select("id", { count: "exact", head: true })
            .eq("rep_id", repId)
            .eq("status", "approved")
        : Promise.resolve({ count: 0 }),

      // Any submission today — used to compute streak.today_locked.
      // Counts every status (pending / approved / rejected / requires_revision):
      // intent + work counts, not just outcome. A rep submitting at 23:55
      // shouldn't lose their streak waiting for admin approval.
      want("rep")
        ? db
            .from(TABLES.REP_QUEST_SUBMISSIONS)
            .select("id", { count: "exact", head: true })
            .eq("rep_id", repId)
            .gte("created_at", startOfTodayIso())
        : Promise.resolve({ count: 0 }),
    ]);

    const leveling: LevelingConfig =
      (platformConfig.leveling as LevelingConfig | undefined) ||
      DEFAULT_LEVELING;
    const tiers: TierDefinition[] =
      (platformConfig.tiers as TierDefinition[] | undefined) || DEFAULT_TIERS;

    // ------------------------------------------------------------------
    // Step 3: compute event-level joins (rep_events aggregates + quest counts)
    // ------------------------------------------------------------------
    const events = (eventsResult.data ?? []) as Array<{
      id: string;
      org_id: string;
      name: string;
      slug: string;
      date_start: string;
      date_end: string | null;
      venue_name: string | null;
      city: string | null;
      country: string | null;
      status: string;
      cover_image: string | null;
      cover_image_url: string | null;
      poster_image_url: string | null;
      banner_image_url: string | null;
    }>;
    const eventIds = events.map((e) => e.id);

    const [repEventsResult, questsResult, mySubmissionsResult] =
      await Promise.all([
        eventIds.length > 0
          ? db
              .from(TABLES.REP_EVENTS)
              .select("event_id, sales_count, revenue")
              .eq("rep_id", repId)
              .in("event_id", eventIds)
          : Promise.resolve({ data: [] }),
        eventIds.length > 0
          ? db
              .from(TABLES.REP_QUESTS)
              .select("id, event_id, points_reward, currency_reward")
              .in("event_id", eventIds)
              .eq("status", "active")
          : Promise.resolve({ data: [] }),
        eventIds.length > 0
          ? db
              .from(TABLES.REP_QUEST_SUBMISSIONS)
              .select("id, quest_id, status, quest:rep_quests(event_id)")
              .eq("rep_id", repId)
              .in(
                "quest_id",
                // fetch submissions only for quests of the events we care about
                // — cheaper than fetching all rep submissions. Use the quest
                // list we just pulled.
                [] // filled below after questsResult lands
              )
          : Promise.resolve({ data: [] }),
      ]);

    // The `.in("quest_id", [])` empty-array shortcut sidesteps a DB round-trip
    // when there are no quests. If there ARE quests, re-run with the right ids.
    const quests = (questsResult.data ?? []) as Array<{
      id: string;
      event_id: string | null;
      points_reward: number;
      currency_reward: number;
    }>;
    const questIds = quests.map((q) => q.id);
    type SubmissionRow = {
      id: string;
      quest_id: string;
      status: string;
      quest: { event_id: string | null } | { event_id: string | null }[] | null;
    };
    type Submission = {
      id: string;
      quest_id: string;
      status: string;
      quest: { event_id: string | null } | null;
    };
    let mySubmissions: Submission[] = [];
    if (questIds.length > 0) {
      const { data } = await db
        .from(TABLES.REP_QUEST_SUBMISSIONS)
        .select("id, quest_id, status, quest:rep_quests(event_id)")
        .eq("rep_id", repId)
        .in("quest_id", questIds);
      const rows = (data ?? []) as unknown as SubmissionRow[];
      mySubmissions = rows.map((r) => ({
        id: r.id,
        quest_id: r.quest_id,
        status: r.status,
        quest: Array.isArray(r.quest) ? r.quest[0] ?? null : r.quest,
      }));
    } else {
      mySubmissions = [];
    }
    // mySubmissionsResult is a no-op placeholder when there are no quests;
    // silence the unused-var complaint by discarding it explicitly.
    void mySubmissionsResult;

    // Index helpers
    const repEventByEventId = new Map<
      string,
      { sales_count: number; revenue: number }
    >();
    for (const re of (repEventsResult.data ?? []) as Array<{
      event_id: string;
      sales_count: number | null;
      revenue: number | null;
    }>) {
      repEventByEventId.set(re.event_id, {
        sales_count: re.sales_count ?? 0,
        revenue: Number(re.revenue ?? 0),
      });
    }

    const questAggByEventId = new Map<
      string,
      {
        total: number;
        xp_reward_max: number;
        ep_reward_max: number;
      }
    >();
    for (const q of quests) {
      if (!q.event_id) continue;
      const agg = questAggByEventId.get(q.event_id) ?? {
        total: 0,
        xp_reward_max: 0,
        ep_reward_max: 0,
      };
      agg.total += 1;
      agg.xp_reward_max += q.points_reward ?? 0;
      agg.ep_reward_max += q.currency_reward ?? 0;
      questAggByEventId.set(q.event_id, agg);
    }

    const myStateByEventId = new Map<
      string,
      { completed: number; in_progress: number }
    >();
    for (const sub of mySubmissions) {
      const eid = sub.quest?.event_id;
      if (!eid) continue;
      const agg = myStateByEventId.get(eid) ?? { completed: 0, in_progress: 0 };
      if (sub.status === "approved") agg.completed += 1;
      else if (sub.status === "pending") agg.in_progress += 1;
      myStateByEventId.set(eid, agg);
    }

    const promoterByOrgId = new Map<string, (typeof approvedMemberships)[0]["promoter"]>();
    for (const m of approvedMemberships) {
      if (m.promoter) promoterByOrgId.set(m.promoter.org_id, m.promoter);
    }

    // ------------------------------------------------------------------
    // Step 4: build each section of the response
    // ------------------------------------------------------------------

    // rep block — mirrors the /me shape
    const progress = getLevelProgress(rep.points_balance ?? 0, leveling);
    const levelName = getTierName(progress.level, tiers);
    const nextTierName = getTierName(progress.level + 1, tiers);

    // Mark today's activity and grab the updated streak numbers. No-op if
    // this rep already hit the dashboard earlier today. Non-blocking from
    // the user's perspective — errors silently ignored.
    let streakCurrent = 0;
    let streakBest = 0;
    if (!isPending) {
      try {
        const { data: streakData } = await db.rpc("mark_rep_active", {
          p_rep_id: repId,
        });
        const row = Array.isArray(streakData) ? streakData[0] : streakData;
        streakCurrent = (row as { current_streak?: number } | null)?.current_streak ?? 0;
        streakBest = (row as { best_streak?: number } | null)?.best_streak ?? 0;
      } catch {
        // Streaks are decorative — never block the dashboard on them.
      }
    }

    // today_locked: did the rep do anything today that should count for
    // their streak? "Anything" = a quest submission (regardless of approval
    // status) or any XP delta. The submission-side answer covers reps who
    // submit at 23:55 and would otherwise lose their streak while admin
    // approval is pending; the XP-side answer covers sales-attribution
    // reps who never submit a quest. iOS used to derive this from
    // `xp.today > 0` alone — that broke for the late-night submission case.
    const submissionsToday = submissionsTodayResult.count ?? 0;
    const xpToday = Array.isArray(repPointsLogTodayResult.data)
      ? (repPointsLogTodayResult.data as Array<{ points: number }>).reduce(
          (sum, row) => sum + (row.points ?? 0),
          0
        )
      : 0;
    const todayLocked = submissionsToday > 0 || xpToday > 0;

    const repBlock = want("rep")
      ? {
          id: rep.id,
          email: rep.email,
          first_name: rep.first_name ?? null,
          last_name: rep.last_name ?? null,
          display_name: rep.display_name ?? null,
          photo_url: rep.photo_url ?? null,
          banner_url: rep.banner_url ?? null,
          bio: rep.bio ?? null,
          instagram: rep.instagram ?? null,
          tiktok: rep.tiktok ?? null,
          level: progress.level,
          tier: levelName,
          xp_balance: rep.points_balance ?? 0,
          ep_balance: rep.currency_balance ?? 0,
          total_sales: rep.total_sales ?? 0,
          total_revenue_pence: Math.round(Number(rep.total_revenue ?? 0) * 100),
          onboarding_completed: rep.onboarding_completed ?? false,
          status: isPending ? "pending" : "active",
          // Flat keys retained for backward compat with iOS clients shipped
          // before the nested `streak` block landed (2026-05-03). Drop once
          // the App Store version requirement bumps past that date.
          streak_current: streakCurrent,
          streak_best: streakBest,
          // New nested shape — iOS reads these going forward. `today_locked`
          // tells iOS whether to render the "you locked today in" affordance
          // without re-deriving it from xp.today > 0 (which lied for reps
          // whose 23:55 submissions hadn't been approved yet).
          streak: {
            current: streakCurrent,
            best: streakBest,
            today_locked: todayLocked,
          },
          follower_count: rep.follower_count ?? 0,
          following_count: rep.following_count ?? 0,
          total_approved_quest_count: approvedQuestCountResult.count ?? 0,
        }
      : null;

    // progress.nextLevelXp is null when the rep is at max level (no next tier)
    const atMaxLevel = progress.nextLevelXp === null;
    const xpBlock = want("xp")
      ? {
          balance: rep.points_balance ?? 0,
          today: xpToday,
          from_last_level: progress.currentLevelXp,
          for_next_level: progress.nextLevelXp,
          level: progress.level,
          tier: levelName,
          tier_next: nextTierName !== levelName ? nextTierName : null,
          xp_to_next_level: atMaxLevel
            ? 0
            : Math.max(
                0,
                (progress.nextLevelXp as number) - (rep.points_balance ?? 0)
              ),
        }
      : null;

    const epBlock = want("ep")
      ? {
          balance: rep.currency_balance ?? 0,
          label: `${rep.currency_balance ?? 0} EP`,
        }
      : null;

    // leaderboard — delta_week compares today's position to the rank from
    // ~7 days ago pulled out of rep_rank_snapshots (written weekly by the
    // /api/cron/rep-rank-snapshots cron). Negative value = climbed, positive
    // = dropped. Null if no snapshot from last week (e.g. brand-new rep).
    let leaderboardBlock: {
      position: number | null;
      total: number;
      delta_week: number | null;
      in_top_10: boolean;
    } | null = null;
    if (want("leaderboard")) {
      const rows =
        (leaderboardResult.data as Array<{ id: string }> | null) ?? [];
      const idx = rows.findIndex((r) => r.id === repId);
      const position = idx >= 0 ? idx + 1 : null;

      let deltaWeek: number | null = null;
      if (position !== null && scopedPromoterIds.length > 0) {
        // Find the nearest snapshot captured 5–10 days ago — roughly "last
        // week" with enough slack to still return something if a cron run
        // was delayed. Snapshots older than 10 days ignored so a stale
        // delta doesn't bleed through weeks of inactivity.
        const fromWindow = new Date(Date.now() - 10 * 24 * 3600 * 1000)
          .toISOString();
        const toWindow = new Date(Date.now() - 5 * 24 * 3600 * 1000)
          .toISOString();
        const { data: lastWeek } = await db
          .from("rep_rank_snapshots")
          .select("rank, captured_at")
          .eq("rep_id", repId)
          .in("promoter_id", scopedPromoterIds)
          .gte("captured_at", fromWindow)
          .lte("captured_at", toWindow)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastWeek?.rank != null) {
          deltaWeek = position - (lastWeek.rank as number);
        }
      }

      leaderboardBlock = {
        position,
        total: rows.length,
        delta_week: deltaWeek,
        in_top_10: position !== null && position <= 10,
      };
    }

    // followed_promoters
    type FollowedPromoterRow = {
      promoter: Promoter | Promoter[] | null;
    };
    const followedPromotersBlock = want("followed_promoters")
      ? (
          (followedPromotersResult.data ?? []) as unknown as FollowedPromoterRow[]
        )
          .map((row) =>
            Array.isArray(row.promoter) ? row.promoter[0] ?? null : row.promoter
          )
          .filter((p): p is Promoter => !!p)
          .map((p) => ({
            id: p.id,
            handle: p.handle,
            display_name: p.display_name,
            tagline: p.tagline,
            accent_hex: p.accent_hex,
            avatar_url: p.avatar_url,
            avatar_initials: p.avatar_initials,
            avatar_bg_hex: p.avatar_bg_hex,
            cover_image_url: p.cover_image_url,
            follower_count: p.follower_count,
            team_size: p.team_size,
            is_following: true,
            is_on_team: approvedMemberships.some(
              (m) => m.promoter?.id === p.id
            ),
          }))
      : null;

    // events
    const eventsBlock = want("events")
      ? events.map((e) => {
          const promoter = promoterByOrgId.get(e.org_id) ?? null;
          const myAgg = repEventByEventId.get(e.id) ?? {
            sales_count: 0,
            revenue: 0,
          };
          const qAgg = questAggByEventId.get(e.id) ?? {
            total: 0,
            xp_reward_max: 0,
            ep_reward_max: 0,
          };
          const myState = myStateByEventId.get(e.id) ?? {
            completed: 0,
            in_progress: 0,
          };
          const available = Math.max(
            0,
            qAgg.total - myState.completed - myState.in_progress
          );
          const { label: dateLabel } = formatDateLabel(
            e.date_start,
            e.city
          );
          return {
            id: e.id,
            promoter_id: promoter?.id ?? null,
            promoter_handle: promoter?.handle ?? null,
            promoter_display_name: promoter?.display_name ?? null,
            title: e.name,
            slug: e.slug,
            date_start: e.date_start,
            date_end: e.date_end,
            venue_name: e.venue_name,
            city: e.city,
            country: e.country,
            status: mapEventStatus(e.status, e.date_start, e.date_end),
            time_label: formatTimeLabel(e.date_start, e.date_end),
            date_label: dateLabel,
            cover_image_url: e.cover_image_url ?? e.cover_image ?? null,
            poster_image_url: e.poster_image_url ?? null,
            banner_image_url: e.banner_image_url ?? null,
            accent_hex: promoter?.accent_hex ?? null,
            sales_count: myAgg.sales_count,
            revenue_pence: Math.round(myAgg.revenue * 100),
            xp_reward_max: qAgg.xp_reward_max,
            ep_reward_max: qAgg.ep_reward_max,
            quests: {
              total: qAgg.total,
              completed: myState.completed,
              in_progress: myState.in_progress,
              available,
            },
          };
        })
      : null;

    // recent_sales — compute ticket_count via one extra query
    type RawOrderRow = {
      id: string;
      order_number: string;
      total: number;
      currency: string | null;
      status: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
      event:
        | { id: string; name: string; slug: string }
        | { id: string; name: string; slug: string }[]
        | null;
    };
    type RawOrder = Omit<RawOrderRow, "event"> & {
      event: { id: string; name: string; slug: string } | null;
    };
    const rawSales: RawOrder[] = (
      (recentSalesResult.data ?? []) as unknown as RawOrderRow[]
    ).map((s) => ({
      ...s,
      event: Array.isArray(s.event) ? s.event[0] ?? null : s.event,
    }));
    let recentSalesBlock: Array<{
      id: string;
      order_number: string;
      total_pence: number;
      currency: string;
      ticket_count: number;
      buyer_first_name: string | null;
      status: string;
      created_at: string;
      event: { id: string; name: string; slug: string } | null;
    }> | null = null;

    if (want("recent_sales")) {
      const orderIds = rawSales.map((s) => s.id);
      let ticketCountByOrder = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: items } = await db
          .from(TABLES.ORDER_ITEMS)
          .select("order_id, qty")
          .in("order_id", orderIds);
        for (const item of (items ?? []) as Array<{
          order_id: string;
          qty: number | null;
        }>) {
          ticketCountByOrder.set(
            item.order_id,
            (ticketCountByOrder.get(item.order_id) ?? 0) + (item.qty ?? 0)
          );
        }
      }
      recentSalesBlock = rawSales.map((s) => ({
        id: s.id,
        order_number: s.order_number,
        total_pence: Math.round(Number(s.total ?? 0) * 100),
        currency: s.currency ?? "GBP",
        ticket_count: ticketCountByOrder.get(s.id) ?? 1,
        buyer_first_name:
          (s.metadata?.["buyer_first_name"] as string | undefined) ??
          (s.metadata?.["first_name"] as string | undefined) ??
          null,
        status: s.status,
        created_at: s.created_at,
        event: s.event,
      }));
    }

    // discount — per-membership codes + primary (first approved membership)
    const primaryMembership =
      approvedMemberships.find((m) => m.discount_code) ?? null;

    const discountBlock = want("discount")
      ? {
          primary_code: primaryMembership?.discount_code ?? null,
          primary_percent: primaryMembership?.discount_percent ?? null,
          per_promoter: approvedMemberships
            .filter((m) => m.discount_code)
            .map((m) => ({
              promoter_id: m.promoter_id,
              code: m.discount_code,
              discount_percent: m.discount_percent,
            })),
        }
      : null;

    // Top-level rep share URL — tenant root with ?ref=primary_code applied.
    // Mirrors discount.primary_code rather than the ?promoter_id= scope,
    // so the field is stable across tab switches in the iOS client and so
    // brand-new reps with zero quests still get a working share link
    // without the client having to lift the host from quest.share_url.
    // Null when the rep has no approved membership carrying a discount.
    const primaryOrgId = primaryMembership?.promoter?.org_id ?? null;
    const primaryDomains = await fetchPrimaryDomains(
      primaryOrgId ? [primaryOrgId] : [],
    );
    const shareUrl = buildRepShareUrl({
      orgId: primaryOrgId,
      code: primaryMembership?.discount_code ?? null,
      domainsByOrgId: primaryDomains,
    });

    // Deferred sections — present but empty so iOS mapper is happy.
    const storyRailBlock = want("story_rail") ? [] : null;
    const feedBlock = want("feed") ? [] : null;
    const featuredRewardsBlock = want("featured_rewards") ? [] : null;

    // ------------------------------------------------------------------
    // Step 5: assemble
    // ------------------------------------------------------------------
    return NextResponse.json({
      data: {
        ...(repBlock && { rep: repBlock }),
        ...(xpBlock && { xp: xpBlock }),
        ...(epBlock && { ep: epBlock }),
        ...(leaderboardBlock && { leaderboard: leaderboardBlock }),
        ...(storyRailBlock && { story_rail: storyRailBlock }),
        ...(followedPromotersBlock && {
          followed_promoters: followedPromotersBlock,
        }),
        ...(eventsBlock && { events: eventsBlock }),
        ...(feedBlock && { feed: feedBlock }),
        ...(recentSalesBlock && { recent_sales: recentSalesBlock }),
        ...(featuredRewardsBlock && { featured_rewards: featuredRewardsBlock }),
        ...(discountBlock && { discount: discountBlock }),
        share_url: shareUrl,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/dashboard] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function mapEventStatus(
  dbStatus: string,
  dateStart: string,
  dateEnd: string | null
): "upcoming" | "live" | "past" {
  const now = Date.now();
  const start = new Date(dateStart).getTime();
  const end = dateEnd ? new Date(dateEnd).getTime() : start + 4 * 3600 * 1000;
  if (now < start) return "upcoming";
  if (now >= start && now <= end) return "live";
  if (dbStatus === "published" || dbStatus === "active") return "upcoming";
  return "past";
}

function formatTimeLabel(dateStart: string, dateEnd: string | null): string {
  const now = Date.now();
  const start = new Date(dateStart).getTime();
  const end = dateEnd ? new Date(dateEnd).getTime() : start + 4 * 3600 * 1000;
  if (now >= start && now <= end) return "live";
  if (now > end) return "ended";
  const diffMs = start - now;
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) {
    const minutes = Math.floor((diffMs % (3600 * 1000)) / 60000);
    return `${hours}h ${minutes}m`;
  }
  return "soon";
}

function formatDateLabel(
  dateStart: string,
  city: string | null
): { label: string } {
  const d = new Date(dateStart);
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const loc = city ? city.toLowerCase() : null;
  return { label: loc ? `${day}.${month} · ${loc}` : `${day}.${month}` };
}
