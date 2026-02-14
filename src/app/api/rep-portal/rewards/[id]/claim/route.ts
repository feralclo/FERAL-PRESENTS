import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { deductPoints } from "@/lib/rep-points";

/**
 * POST /api/rep-portal/rewards/[id]/claim — Claim a points_shop reward (protected)
 *
 * Verifies the rep has enough points, deducts them, creates a claim row,
 * and updates the reward's total_claimed counter.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const { id: rewardId } = await params;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Fetch the reward
    const { data: reward, error: rewardError } = await supabase
      .from(TABLES.REP_REWARDS)
      .select("*")
      .eq("id", rewardId)
      .eq("org_id", ORG_ID)
      .single();

    if (rewardError || !reward) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    // Validate reward type
    if (reward.reward_type !== "points_shop") {
      return NextResponse.json(
        { error: "This reward cannot be claimed via points. It is a milestone reward." },
        { status: 400 }
      );
    }

    // Validate reward is active
    if (reward.status !== "active") {
      return NextResponse.json(
        { error: "This reward is no longer available" },
        { status: 400 }
      );
    }

    // Check availability
    if (
      reward.total_available !== null &&
      reward.total_claimed >= reward.total_available
    ) {
      return NextResponse.json(
        { error: "This reward is sold out" },
        { status: 400 }
      );
    }

    const pointsCost = reward.points_cost || 0;
    if (pointsCost <= 0) {
      return NextResponse.json(
        { error: "This reward has no points cost configured" },
        { status: 400 }
      );
    }

    // Verify rep has enough points
    const { data: rep, error: repError } = await supabase
      .from(TABLES.REPS)
      .select("points_balance")
      .eq("id", repId)
      .eq("org_id", ORG_ID)
      .single();

    if (repError || !rep) {
      return NextResponse.json(
        { error: "Rep not found" },
        { status: 404 }
      );
    }

    if (rep.points_balance < pointsCost) {
      return NextResponse.json(
        {
          error: `Not enough points. You have ${rep.points_balance} points but this reward costs ${pointsCost} points.`,
        },
        { status: 400 }
      );
    }

    // Deduct points
    const newBalance = await deductPoints({
      repId,
      orgId: ORG_ID,
      points: pointsCost,
      sourceType: "reward_spend",
      sourceId: rewardId,
      description: `Claimed reward: ${reward.name}`,
    });

    if (newBalance === null) {
      return NextResponse.json(
        { error: "Failed to deduct points" },
        { status: 500 }
      );
    }

    // Create claim row
    const { data: claim, error: claimError } = await supabase
      .from(TABLES.REP_REWARD_CLAIMS)
      .insert({
        org_id: ORG_ID,
        rep_id: repId,
        reward_id: rewardId,
        claim_type: "points_shop",
        milestone_id: null,
        points_spent: pointsCost,
        status: "claimed",
      })
      .select("*")
      .single();

    if (claimError) {
      console.error("[rep-portal/rewards/claim] Insert error:", claimError);
      // Points were already deducted — log for manual reconciliation
      console.error(
        `[rep-portal/rewards/claim] CRITICAL: Points deducted (${pointsCost}) but claim row failed for rep=${repId} reward=${rewardId}`
      );
      return NextResponse.json(
        { error: "Failed to create claim. Please contact support." },
        { status: 500 }
      );
    }

    // Update reward total_claimed
    await supabase
      .from(TABLES.REP_REWARDS)
      .update({ total_claimed: reward.total_claimed + 1 })
      .eq("id", rewardId)
      .eq("org_id", ORG_ID);

    return NextResponse.json({
      data: {
        claim,
        new_balance: newBalance,
      },
    });
  } catch (err) {
    console.error("[rep-portal/rewards/claim] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
