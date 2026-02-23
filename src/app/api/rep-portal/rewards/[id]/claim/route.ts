import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * POST /api/rep-portal/rewards/[id]/claim — Claim a points_shop reward (protected)
 *
 * Uses the `claim_reward_atomic` RPC to deduct points + create claim + increment
 * total_claimed in a single database transaction. This prevents race conditions
 * where points are deducted but the claim row fails to insert.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;
    const { id: rewardId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Fetch the reward for validation before calling RPC
    const { data: reward, error: rewardError } = await supabase
      .from(TABLES.REP_REWARDS)
      .select("reward_type, points_cost")
      .eq("id", rewardId)
      .eq("org_id", orgId)
      .single();

    if (rewardError || !reward) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    if (reward.reward_type !== "points_shop") {
      return NextResponse.json(
        { error: "This reward cannot be claimed via points. It is a milestone reward." },
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

    // Call the atomic RPC — handles locking, balance check, deduction, claim creation
    const { data, error } = await supabase.rpc("claim_reward_atomic", {
      p_rep_id: repId,
      p_org_id: orgId,
      p_reward_id: rewardId,
      p_points_cost: pointsCost,
    });

    if (error) {
      console.error("[rep-portal/rewards/claim] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to process claim" },
        { status: 500 }
      );
    }

    const result = data as {
      success?: boolean;
      error?: string;
      balance?: number;
      claim_id?: string;
      new_balance?: number;
    };

    if (result.error) {
      // Map RPC errors to appropriate HTTP status codes
      const errorMap: Record<string, { status: number; message: string }> = {
        "Rep not found": { status: 404, message: "Rep not found" },
        "Reward not found": { status: 404, message: "Reward not found" },
        "Reward is not active": { status: 400, message: "This reward is no longer available" },
        "Reward is sold out": { status: 400, message: "This reward is sold out" },
        "Already claimed": { status: 400, message: "You have already claimed this reward" },
      };

      if (result.error === "Insufficient balance") {
        return NextResponse.json(
          {
            error: `Not enough balance. You have ${result.balance} but this reward costs ${pointsCost}.`,
          },
          { status: 400 }
        );
      }

      const mapped = errorMap[result.error];
      if (mapped) {
        return NextResponse.json({ error: mapped.message }, { status: mapped.status });
      }

      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        claim_id: result.claim_id,
        new_balance: result.new_balance,
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
