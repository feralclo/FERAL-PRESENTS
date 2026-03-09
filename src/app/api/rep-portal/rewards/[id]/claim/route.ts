import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { fulfillRewardClaim } from "@/lib/rep-reward-fulfillment";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/rewards/[id]/claim — Claim a points_shop reward (protected)
 *
 * Uses the `claim_reward_atomic` RPC to deduct currency + create claim + increment
 * total_claimed in a single database transaction. Then dispatches fulfillment
 * for automated reward types (free_ticket, vip_upgrade, merch).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const rep = auth.rep;
    const repId = rep.id;
    const orgId = rep.org_id;
    const { id: rewardId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Parse optional body (merch_size for merch rewards)
    let body: { merch_size?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — fine for non-merch claims
    }

    // Fetch the full reward for validation + fulfillment
    const { data: reward, error: rewardError } = await supabase
      .from(TABLES.REP_REWARDS)
      .select("id, name, reward_type, points_cost, product_id, metadata")
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

    // ── Fulfillment phase ──
    const fulfillmentType = reward.metadata?.fulfillment_type || "manual";
    let claimMetadata = {};

    if (fulfillmentType !== "manual" && result.claim_id) {
      // Fetch full rep data for fulfillment (requireRepAuth only returns minimal fields)
      const { data: fullRep } = await supabase
        .from(TABLES.REPS)
        .select("id, email, first_name, last_name, org_id")
        .eq("id", repId)
        .eq("org_id", orgId)
        .single();

      if (!fullRep) {
        return NextResponse.json({ error: "Rep data not found" }, { status: 500 });
      }

      const fulfillResult = await fulfillRewardClaim({
        supabase,
        orgId,
        rep: fullRep,
        reward,
        claimId: result.claim_id,
        body,
      });

      if ("error" in fulfillResult) {
        // Map technical errors to user-friendly messages
        const friendlyErrors: Record<string, string> = {
          "Merch size is required": "Please select a size before claiming.",
          "Event not found for reward": "This reward's event is no longer available.",
          "No existing ticket found for this event. Purchase a ticket first, then upgrade.":
            "You need a ticket for this event first before you can upgrade.",
        };
        const msg = friendlyErrors[fulfillResult.error] || fulfillResult.error;
        return NextResponse.json(
          { error: msg },
          { status: 400 }
        );
      }

      claimMetadata = fulfillResult.metadata;
    }

    return NextResponse.json({
      data: {
        claim_id: result.claim_id,
        new_balance: result.new_balance,
        fulfillment_type: fulfillmentType,
        ...claimMetadata,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/rewards/claim] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
