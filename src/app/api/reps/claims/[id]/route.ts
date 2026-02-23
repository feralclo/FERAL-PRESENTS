import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { awardPoints } from "@/lib/rep-points";
import { createNotification } from "@/lib/rep-notifications";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * PUT /api/reps/claims/[id] — Fulfill or cancel a claim
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    if (!status || !["fulfilled", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'fulfilled' or 'cancelled'" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch the claim
    const { data: claim, error: fetchErr } = await supabase
      .from(TABLES.REP_REWARD_CLAIMS)
      .select("id, status, reward_id, rep_id, points_spent, notes")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (fetchErr || !claim) {
      return NextResponse.json(
        { error: "Claim not found" },
        { status: 404 }
      );
    }

    if (claim.status === "fulfilled" || claim.status === "cancelled") {
      return NextResponse.json(
        { error: `Claim is already ${claim.status}` },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      status,
      notes: notes?.trim() || claim.notes || null,
    };

    if (status === "fulfilled") {
      updates.fulfilled_at = new Date().toISOString();
      updates.fulfilled_by = auth.user!.id;
    }

    const { data, error } = await supabase
      .from(TABLES.REP_REWARD_CLAIMS)
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If fulfilling, send notification + email
    if (status === "fulfilled") {
      // Fetch reward details for notification content
      const { data: rewardInfo } = await supabase
        .from(TABLES.REP_REWARDS)
        .select("name, custom_value, product:products(name)")
        .eq("id", claim.reward_id)
        .eq("org_id", orgId)
        .single();

      const rewardName = rewardInfo?.name || "Your reward";
      const product = rewardInfo?.product as unknown as { name: string } | null;

      createNotification({
        repId: claim.rep_id,
        orgId,
        type: "reward_fulfilled",
        title: "Reward Fulfilled!",
        body: `${rewardName} is ready for you`,
        link: "/rep/rewards",
        metadata: { reward_id: claim.reward_id, claim_id: id },
      }).catch(() => {});

      sendRepEmail({
        type: "reward_fulfilled",
        repId: claim.rep_id,
        orgId,
        data: {
          reward_name: rewardName,
          product_name: product?.name,
          custom_value: rewardInfo?.custom_value,
          notes: notes?.trim() || claim.notes,
        },
      }).catch(() => {});
    }

    // If cancelling, refund points and decrement total_claimed
    if (status === "cancelled") {
      if (claim.points_spent && claim.points_spent > 0) {
        const refundResult = await awardPoints({
          repId: claim.rep_id,
          orgId,
          points: claim.points_spent,
          sourceType: "refund",
          sourceId: claim.id,
          description: "Points refunded — claim cancelled",
          createdBy: auth.user!.id,
        });
        if (!refundResult) {
          console.error(`[claims] CRITICAL: Failed to refund ${claim.points_spent} points to rep ${claim.rep_id} for claim ${claim.id}`);
        }
      }

      const { data: reward } = await supabase
        .from(TABLES.REP_REWARDS)
        .select("total_claimed")
        .eq("id", claim.reward_id)
        .eq("org_id", orgId)
        .single();

      if (reward && reward.total_claimed > 0) {
        await supabase
          .from(TABLES.REP_REWARDS)
          .update({
            total_claimed: reward.total_claimed - 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claim.reward_id)
          .eq("org_id", orgId);
      }
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
