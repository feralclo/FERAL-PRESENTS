import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { awardPoints } from "@/lib/rep-points";

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

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    if (!status || !["fulfilled", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'fulfilled' or 'cancelled'" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
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
      .eq("org_id", ORG_ID)
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
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If cancelling, refund points and decrement total_claimed
    if (status === "cancelled") {
      if (claim.points_spent && claim.points_spent > 0) {
        const refundResult = await awardPoints({
          repId: claim.rep_id,
          orgId: ORG_ID,
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
        .eq("org_id", ORG_ID)
        .single();

      if (reward && reward.total_claimed > 0) {
        await supabase
          .from(TABLES.REP_REWARDS)
          .update({
            total_claimed: reward.total_claimed - 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claim.reward_id)
          .eq("org_id", ORG_ID);
      }
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
