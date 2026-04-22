import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/quests/[id]/accept
 *
 * Rep taps "Accept" on a quest. Moves the quest from the New rail into
 * Your Quests on iOS. This is a UX flag only — accepting does NOT gate
 * submission (reps can submit proof without accepting first, and approved
 * quests are treated as accepted regardless).
 *
 * Idempotent: second POST is a no-op that returns the existing acceptance
 * timestamp.
 *
 * Auth: rep only. Quest must belong to a promoter this rep has an approved
 * membership with (or be a platform-level quest, promoter_id IS NULL).
 *
 * Response:
 *   { data: { accepted: true, accepted_at: ISO8601 } }
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: questId } = await params;
    if (!questId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questId)) {
      return NextResponse.json({ error: "Invalid quest id" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // 1. Load quest + verify visibility scope for this rep
    const { data: quest } = await db
      .from(TABLES.REP_QUESTS)
      .select("id, status, promoter_id")
      .eq("id", questId)
      .maybeSingle();

    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    if (quest.status !== "active") {
      return NextResponse.json(
        { error: "Quest is not active" },
        { status: 409 }
      );
    }

    // Quest must be either platform-level OR one the rep has an approved
    // membership for. Prevents acceptances leaking across team boundaries.
    if (quest.promoter_id) {
      const { data: membership } = await db
        .from("rep_promoter_memberships")
        .select("status")
        .eq("rep_id", auth.rep.id)
        .eq("promoter_id", quest.promoter_id)
        .maybeSingle();

      if (!membership || membership.status !== "approved") {
        return NextResponse.json(
          { error: "Not a member of this promoter's team" },
          { status: 403 }
        );
      }
    }

    // 2. Upsert acceptance
    const { error: upsertError } = await db
      .from("rep_quest_acceptances")
      .upsert(
        { rep_id: auth.rep.id, quest_id: questId },
        { onConflict: "rep_id,quest_id", ignoreDuplicates: true }
      );

    if (upsertError) {
      Sentry.captureException(upsertError, {
        extra: { repId: auth.rep.id, questId },
      });
      return NextResponse.json(
        { error: "Failed to accept quest" },
        { status: 500 }
      );
    }

    // 3. Return the (possibly existing) acceptance
    const { data: row } = await db
      .from("rep_quest_acceptances")
      .select("accepted_at")
      .eq("rep_id", auth.rep.id)
      .eq("quest_id", questId)
      .single();

    return NextResponse.json({
      data: {
        accepted: true,
        accepted_at: row?.accepted_at ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/quests/[id]/accept] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
