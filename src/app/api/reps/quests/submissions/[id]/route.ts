import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { awardPoints } from "@/lib/rep-points";

/**
 * PUT /api/reps/quests/submissions/[id] — Approve or reject a submission
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
    const { status, rejection_reason } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    if (status === "rejected" && !rejection_reason) {
      return NextResponse.json(
        { error: "rejection_reason is required when rejecting" },
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

    // Fetch the submission with quest and rep info
    const { data: submission, error: fetchErr } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .select("*, quest:rep_quests(id, title, points_reward, total_completed), rep:reps(id, first_name, last_name, display_name, email, photo_url)")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (fetchErr || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: `Submission is already ${submission.status}` },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      status,
      reviewed_by: auth.user!.id,
      reviewed_at: new Date().toISOString(),
    };

    if (status === "rejected") {
      updates.rejection_reason = rejection_reason.trim();
      updates.points_awarded = 0;
    }

    if (status === "approved") {
      const pointsReward = submission.quest?.points_reward || 0;
      updates.points_awarded = pointsReward;
    }

    // Update the submission status first — if this fails, don't award points
    const { data, error } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .update(updates)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Award points and increment counter only after successful status update
    if (status === "approved") {
      const pointsReward = submission.quest?.points_reward || 0;

      if (pointsReward > 0) {
        await awardPoints({
          repId: submission.rep_id,
          orgId: ORG_ID,
          points: pointsReward,
          sourceType: "quest",
          sourceId: submission.quest_id,
          description: `Quest completed: ${submission.quest?.title || "Unknown quest"}`,
          createdBy: auth.user!.id,
        });
      }

      // Increment total_completed on the quest
      const { data: currentQuest } = await supabase
        .from(TABLES.REP_QUESTS)
        .select("total_completed")
        .eq("id", submission.quest_id)
        .eq("org_id", ORG_ID)
        .single();

      await supabase
        .from(TABLES.REP_QUESTS)
        .update({
          total_completed: (currentQuest?.total_completed || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submission.quest_id)
        .eq("org_id", ORG_ID);
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
