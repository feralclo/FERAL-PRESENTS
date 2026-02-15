import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/rewards — Available rewards for current rep (protected)
 *
 * Returns milestone rewards with progress and points_shop items.
 * Includes the rep's existing claims.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Fetch in parallel: rewards, milestones, rep stats, rep claims
    const [rewardsResult, milestonesResult, repResult, claimsResult] =
      await Promise.all([
        // All active rewards
        supabase
          .from(TABLES.REP_REWARDS)
          .select("*, product:products(name, images)")
          .eq("org_id", ORG_ID)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(100),

        // All milestones
        supabase
          .from(TABLES.REP_MILESTONES)
          .select("*, event:events(name)")
          .eq("org_id", ORG_ID)
          .order("sort_order", { ascending: true }),

        // Rep stats for milestone progress
        supabase
          .from(TABLES.REPS)
          .select("points_balance, total_sales, total_revenue")
          .eq("id", repId)
          .eq("org_id", ORG_ID)
          .single(),

        // Rep's claims
        supabase
          .from(TABLES.REP_REWARD_CLAIMS)
          .select("id, reward_id, claim_type, milestone_id, points_spent, status, created_at")
          .eq("rep_id", repId)
          .eq("org_id", ORG_ID)
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

    // Enrich rewards with milestones, progress, and claims
    const enrichedRewards = rewards.map((reward: Record<string, unknown>) => {
      const rewardId = reward.id as string;
      const rewardType = reward.reward_type as string;
      const rewardMilestones = milestonesByReward[rewardId] || [];
      const rewardClaims = claimsByReward[rewardId] || [];

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

      // Use product image as fallback if reward has no direct image
      const product = reward.product as Record<string, unknown> | null;
      const productImages = (product?.images ?? []) as string[];
      const imageUrl = (reward.image_url as string) || productImages[0] || null;

      return {
        ...reward,
        image_url: imageUrl,
        milestones: rewardType === "milestone" ? milestonesWithProgress : [],
        my_claims: rewardClaims,
        can_purchase:
          rewardType === "points_shop" &&
          rep &&
          reward.points_cost &&
          rep.points_balance >= (reward.points_cost as number) &&
          (reward.total_available === null ||
            (reward.total_claimed as number) < (reward.total_available as number)),
      };
    });

    return NextResponse.json({ data: enrichedRewards });
  } catch (err) {
    console.error("[rep-portal/rewards] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
