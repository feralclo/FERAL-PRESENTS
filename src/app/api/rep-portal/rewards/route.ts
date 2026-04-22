import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/rewards — Available rewards for current rep (protected)
 *
 * Returns milestone rewards with progress and points_shop items.
 * Includes the rep's existing claims, enriched event/ticket names,
 * and multi-claim tracking.
 */
export async function GET() {
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

    // Fetch in parallel: rewards, milestones, rep stats, rep claims
    const [rewardsResult, milestonesResult, repResult, claimsResult] =
      await Promise.all([
        // All active rewards (include product sizes for merch)
        supabase
          .from(TABLES.REP_REWARDS)
          .select("*, product:products(name, images, sizes)")
          .eq("org_id", orgId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(100),

        // All milestones
        supabase
          .from(TABLES.REP_MILESTONES)
          .select("*, event:events(name)")
          .eq("org_id", orgId)
          .order("sort_order", { ascending: true }),

        // Rep stats for milestone progress
        supabase
          .from(TABLES.REPS)
          .select("points_balance, currency_balance, total_sales, total_revenue")
          .eq("id", repId)
          .eq("org_id", orgId)
          .single(),

        // Rep's claims
        supabase
          .from(TABLES.REP_REWARD_CLAIMS)
          .select("id, reward_id, claim_type, milestone_id, points_spent, status, metadata, created_at")
          .eq("rep_id", repId)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
      ]);

    if (rewardsResult.error) {
      console.error("[rep-portal/rewards] Rewards query error:", rewardsResult.error);
      return NextResponse.json(
        { error: "Failed to fetch rewards" },
        { status: 500 }
      );
    }

    const rewards = rewardsResult.data || [];
    const milestones = milestonesResult.data || [];
    const rep = repResult.data;
    const claims = claimsResult.data || [];

    // Collect event_ids and ticket_type_ids from reward metadata for name lookups
    const eventIds = new Set<string>();
    const ticketTypeIds = new Set<string>();
    for (const reward of rewards) {
      const meta = reward.metadata as Record<string, unknown> | null;
      if (meta?.event_id) eventIds.add(meta.event_id as string);
      if (meta?.ticket_type_id) ticketTypeIds.add(meta.ticket_type_id as string);
      if (meta?.upgrade_to_ticket_type_id) ticketTypeIds.add(meta.upgrade_to_ticket_type_id as string);
    }

    // Fetch event and ticket type names in parallel
    const [eventsLookup, ticketTypesLookup] = await Promise.all([
      eventIds.size > 0
        ? supabase.from(TABLES.EVENTS).select("id, name, cover_image, hero_image").in("id", [...eventIds]).eq("org_id", orgId)
        : { data: [] },
      ticketTypeIds.size > 0
        ? supabase.from(TABLES.TICKET_TYPES).select("id, name").in("id", [...ticketTypeIds]).eq("org_id", orgId)
        : { data: [] },
    ]);

    const eventNameMap = new Map<string, string>();
    const eventImageMap = new Map<string, string>();
    for (const e of (eventsLookup.data || []) as { id: string; name: string; cover_image?: string; hero_image?: string }[]) {
      eventNameMap.set(e.id, e.name);
      const eventImg = e.cover_image || e.hero_image;
      if (eventImg) eventImageMap.set(e.id, eventImg);
    }
    const ticketTypeNameMap = new Map<string, string>();
    for (const tt of (ticketTypesLookup.data || []) as { id: string; name: string }[]) {
      ticketTypeNameMap.set(tt.id, tt.name);
    }

    // Build claims lookup by reward_id
    const claimsByReward: Record<string, Array<Record<string, unknown>>> = {};
    for (const claim of claims) {
      const c = claim as Record<string, unknown>;
      const rewardId = c.reward_id as string;
      if (!claimsByReward[rewardId]) claimsByReward[rewardId] = [];
      claimsByReward[rewardId].push(c);
    }

    // Build milestone lookup by reward_id
    const milestonesByReward: Record<string, Array<Record<string, unknown>>> = {};
    for (const milestone of milestones) {
      const m = milestone as Record<string, unknown>;
      const rewardId = m.reward_id as string;
      if (!milestonesByReward[rewardId]) milestonesByReward[rewardId] = [];
      milestonesByReward[rewardId].push(m);
    }

    // Claimed milestone IDs for progress tracking
    const claimedMilestoneIds = new Set(
      claims
        .filter((c: Record<string, unknown>) => c.milestone_id)
        .map((c: Record<string, unknown>) => c.milestone_id as string)
    );

    // Enrich rewards with milestones, progress, claims, and metadata lookups
    const enrichedRewards = rewards.map((reward: Record<string, unknown>) => {
      const rewardId = reward.id as string;
      const rewardType = reward.reward_type as string;
      const rewardMilestones = milestonesByReward[rewardId] || [];
      const rewardClaims = claimsByReward[rewardId] || [];
      const meta = reward.metadata as Record<string, unknown> | null;

      // Count active (non-cancelled) claims for multi-claim tracking
      const activeClaims = rewardClaims.filter((c) => c.status !== "cancelled");
      const claimsCount = activeClaims.length;
      const maxClaims = meta?.max_claims_per_rep != null
        ? (meta.max_claims_per_rep as number)
        : 1; // default 1 for backward compat

      // Calculate milestone progress
      const milestonesWithProgress = rewardMilestones.map(
        (m: Record<string, unknown>) => {
          let currentValue = 0;
          const thresholdValue = m.threshold_value as number;

          if (rep) {
            switch (m.milestone_type) {
              case "sales_count":
                currentValue = rep.total_sales;
                break;
              case "revenue":
                currentValue = Number(rep.total_revenue);
                break;
              case "points":
                currentValue = rep.points_balance;
                break;
            }
          }

          return {
            ...m,
            current_value: currentValue,
            achieved: currentValue >= thresholdValue,
            claimed: claimedMilestoneIds.has(m.id as string),
            progress_percent: thresholdValue > 0
              ? Math.min(100, Math.round((currentValue / thresholdValue) * 100))
              : 0,
          };
        }
      );

      // Image fallback chain: reward image → event cover image → product image
      const product = reward.product as Record<string, unknown> | null;
      const productImages = (product?.images ?? []) as string[];
      const eventImage = meta?.event_id ? eventImageMap.get(meta.event_id as string) || null : null;
      const imageUrl = (reward.image_url as string) || eventImage || productImages[0] || null;

      // Resolve event and ticket type names from metadata
      const eventName = meta?.event_id ? eventNameMap.get(meta.event_id as string) || null : null;
      const ticketTypeName = meta?.ticket_type_id ? ticketTypeNameMap.get(meta.ticket_type_id as string) || null : null;
      const upgradeTicketTypeName = meta?.upgrade_to_ticket_type_id ? ticketTypeNameMap.get(meta.upgrade_to_ticket_type_id as string) || null : null;

      // Normalise reward_type to the iOS-contract name ('shop' instead of
      // legacy 'points_shop'). Keep both readable until v1 web is retired.
      const normalisedKind: "milestone" | "shop" | "manual" =
        rewardType === "points_shop" ? "shop" : (rewardType as typeof normalisedKind);

      // Prefer new ep_cost column; fall back to legacy points_cost
      const epCost = (reward.ep_cost as number | null) ?? (reward.points_cost as number | null) ?? 0;
      // xp_threshold is the new name for milestone-unlock level requirement
      const xpThreshold = (reward.xp_threshold as number | null) ?? (rewardType === "milestone" ? (reward.points_cost as number | null) : null);

      // Effective stock — prefer new `stock`, fall back to legacy total_available - total_claimed
      let stockRemaining: number | null = null;
      if (reward.stock !== null && reward.stock !== undefined) {
        stockRemaining = reward.stock as number;
      } else if (reward.total_available !== null && reward.total_available !== undefined) {
        stockRemaining = Math.max(
          0,
          (reward.total_available as number) - ((reward.total_claimed as number) ?? 0)
        );
      }

      // can_purchase: check ledger balance, stock, and multi-claim limits
      const canClaimMore =
        normalisedKind === "shop" &&
        rep &&
        epCost > 0 &&
        rep.currency_balance >= epCost &&
        (stockRemaining === null || stockRemaining > 0) &&
        (maxClaims === 0 || maxClaims === null || claimsCount < maxClaims);

      // Fulfillment kind — prefer new column, fall back to mapping from
      // legacy metadata.fulfillment_type.
      const legacyFulfillmentType = meta?.fulfillment_type as string | undefined;
      const fulfillmentKind =
        (reward.fulfillment_kind as string | null | undefined) ??
        mapLegacyFulfillmentToKind(legacyFulfillmentType);

      // Derive iOS my_claim_state from rep's claims + stock + unlock check.
      // Last claim's status (newest first per query order) drives the state
      // for UIs that show a single "status pill" per reward card.
      const latestClaim = rewardClaims[0] as
        | { status?: string }
        | undefined;
      const unlockedMilestone =
        normalisedKind === "milestone" &&
        rep &&
        xpThreshold !== null &&
        xpThreshold !== undefined &&
        (rep.points_balance as number) >= xpThreshold;

      let myClaimState: "available" | "claimed" | "fulfilled" | "out_of_stock" | "locked";
      if (latestClaim?.status === "fulfilled") {
        myClaimState = "fulfilled";
      } else if (
        latestClaim?.status === "claimed" ||
        latestClaim?.status === "fulfilling"
      ) {
        myClaimState = "claimed";
      } else if (stockRemaining === 0) {
        myClaimState = "out_of_stock";
      } else if (normalisedKind === "milestone" && !unlockedMilestone) {
        myClaimState = "locked";
      } else {
        myClaimState = "available";
      }

      return {
        // Legacy fields (kept verbatim so v1 web keeps working)
        ...reward,
        image_url: imageUrl,
        milestones: rewardType === "milestone" ? milestonesWithProgress : [],
        my_claims: rewardClaims,
        claims_count: claimsCount,
        max_claims: maxClaims,
        event_name: eventName,
        ticket_type_name: ticketTypeName,
        upgrade_ticket_type_name: upgradeTicketTypeName,
        can_purchase: canClaimMore,
        // iOS-contract fields (§6.6) — explicit names, explicit shapes
        kind: normalisedKind,
        fulfillment_kind: fulfillmentKind,
        ep_cost: epCost,
        xp_cost: xpThreshold,                    // present for milestone rewards
        milestone_threshold: xpThreshold,        // alias for iOS mapper
        stock: stockRemaining,                   // null = unlimited
        unlocked: normalisedKind === "milestone" ? !!unlockedMilestone : true,
        my_claim_state: myClaimState,
        promoter_id: null,                       // TODO Phase 3.10: plumb promoter_id once reward editor writes it
      };
    });

    return NextResponse.json({ data: enrichedRewards });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/rewards] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

// Legacy metadata.fulfillment_type → iOS fulfillment_kind enum (§5.11)
function mapLegacyFulfillmentToKind(
  legacy: string | undefined
): "digital_ticket" | "guest_list" | "merch" | "custom" | null {
  switch (legacy) {
    case "free_ticket":
    case "extra_tickets":
      return "digital_ticket";
    case "vip_upgrade":
      return "guest_list";
    case "merch":
      return "merch";
    case "manual":
      return "custom";
    default:
      return null;
  }
}
