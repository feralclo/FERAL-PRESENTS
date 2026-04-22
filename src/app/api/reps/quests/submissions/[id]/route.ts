import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { awardPoints } from "@/lib/rep-points";
import { createNotification } from "@/lib/rep-notifications";
import * as Sentry from "@sentry/nextjs";

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
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();
    const { status, rejection_reason } = body;

    // 'requires_revision' sits between approved and rejected: the submission
    // is declined for THIS attempt, but the rep is invited to resubmit with
    // the reviewer's revision guidance. No XP/EP awarded until an eventual
    // 'approved'.
    if (!status || !["approved", "rejected", "requires_revision"].includes(status)) {
      return NextResponse.json(
        {
          error:
            "status must be 'approved', 'rejected', or 'requires_revision'",
        },
        { status: 400 }
      );
    }

    if ((status === "rejected" || status === "requires_revision") && !rejection_reason) {
      return NextResponse.json(
        {
          error:
            status === "rejected"
              ? "rejection_reason is required when rejecting"
              : "rejection_reason is required for revision requests (what needs to change?)",
        },
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
      .select("*, quest:rep_quests(id, title, points_reward, xp_reward, currency_reward, ep_reward, total_completed), rep:reps(id, first_name, last_name, display_name, email, photo_url)")
      .eq("id", id)
      .eq("org_id", orgId)
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

    if (status === "rejected" || status === "requires_revision") {
      updates.rejection_reason = rejection_reason.trim();
      updates.points_awarded = 0;
      updates.requires_revision = status === "requires_revision";
    }

    if (status === "approved") {
      // Legacy points_awarded tracking — keep in sync with the new xp_reward
      // column preferred by iOS / Android / web-v2.
      updates.points_awarded =
        submission.quest?.xp_reward ?? submission.quest?.points_reward ?? 0;
      updates.requires_revision = false;
    }

    // Update the submission status first — if this fails, don't award points
    const { data, error } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Award XP + EP and increment counter only after successful status update
    if (status === "approved") {
      // XP (platform-wide, via rep_points_log + cached reps.points_balance)
      const xpReward =
        submission.quest?.xp_reward ?? submission.quest?.points_reward ?? 0;
      // EP (real money — goes through the ledger RPC, NOT awardPoints)
      const epReward =
        submission.quest?.ep_reward ?? submission.quest?.currency_reward ?? 0;

      // XP first — never fails the approval
      if (xpReward > 0) {
        await awardPoints({
          repId: submission.rep_id,
          orgId,
          points: xpReward,
          currency: 0, // EP handled separately via ledger — don't double-credit
          sourceType: "quest",
          sourceId: submission.quest_id,
          description: `Quest completed: ${submission.quest?.title || "Unknown quest"}`,
          createdBy: auth.user!.id,
        });
      }

      // EP via the atomic ledger RPC — may raise insufficient_float
      if (epReward > 0) {
        const { getEpConfig } = await import("@/lib/ep/config");
        const epConfig = await getEpConfig();
        const { error: epError } = await supabase.rpc("award_quest_ep", {
          p_rep_id: submission.rep_id,
          p_tenant_org_id: orgId,
          p_ep_amount: epReward,
          p_quest_submission_id: id,
          p_fiat_rate_pence: epConfig.fiat_rate_pence,
        });

        if (epError) {
          // Float shortfall OR other RPC failure. Roll the submission back to
          // pending so the admin can fix (top up EP, lower the reward, etc.)
          // rather than leaving the approval stuck in an awarded-XP-but-not-EP
          // state.
          await supabase
            .from(TABLES.REP_QUEST_SUBMISSIONS)
            .update({ status: "pending", reviewed_at: null, reviewed_by: null })
            .eq("id", id)
            .eq("org_id", orgId);

          const message = epError.message?.includes("insufficient_float")
            ? `Not enough EP float to cover this reward. Top up your EP balance before approving.`
            : "Failed to credit EP reward";

          Sentry.captureException(epError, {
            extra: { submissionId: id, orgId, epReward },
          });
          return NextResponse.json(
            {
              error: message,
              code: epError.message?.includes("insufficient_float")
                ? "insufficient_float"
                : "ep_award_failed",
            },
            { status: 400 }
          );
        }
      }

      // Increment total_completed on the quest (best-effort — cache only)
      const { data: currentQuest } = await supabase
        .from(TABLES.REP_QUESTS)
        .select("total_completed")
        .eq("id", submission.quest_id)
        .eq("org_id", orgId)
        .single();

      await supabase
        .from(TABLES.REP_QUESTS)
        .update({
          total_completed: (currentQuest?.total_completed || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submission.quest_id)
        .eq("org_id", orgId);

      // In-app notification for quest approval
      const notifParts = [];
      if (xpReward > 0) notifParts.push(`+${xpReward} XP`);
      if (epReward > 0) notifParts.push(`+${epReward} EP`);
      createNotification({
        repId: submission.rep_id,
        orgId,
        type: "quest_approved",
        title: "Quest Approved!",
        body: `${submission.quest?.title || "Quest"} — ${notifParts.join(" ")}`,
        link: "/rep/quests",
        metadata: { quest_id: submission.quest_id, submission_id: id, xp_awarded: xpReward, ep_awarded: epReward },
      }).catch(() => {});
    } else if (status === "rejected") {
      createNotification({
        repId: submission.rep_id,
        orgId,
        type: "quest_rejected",
        title: "Quest submission rejected",
        body: rejection_reason.trim(),
        link: "/rep/quests",
        metadata: { quest_id: submission.quest_id, submission_id: id },
      }).catch(() => {});
    } else if (status === "requires_revision") {
      createNotification({
        repId: submission.rep_id,
        orgId,
        type: "quest_revision_requested",
        title: "Quest needs revision",
        body: rejection_reason.trim(),
        link: "/rep/quests",
        metadata: { quest_id: submission.quest_id, submission_id: id },
      }).catch(() => {});
    }

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
