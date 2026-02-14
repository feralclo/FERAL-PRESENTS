import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/quests — Available quests for current rep (protected)
 *
 * Shows quests where event_id is null (global) or event_id is in the rep's
 * assigned events. Includes the rep's submission count per quest.
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status") || "active";

    // Get rep's assigned event IDs
    const { data: repEvents } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("event_id")
      .eq("rep_id", repId)
      .eq("org_id", ORG_ID);

    const eventIds = (repEvents || []).map(
      (re: { event_id: string }) => re.event_id
    );

    // Fetch quests: global OR in rep's assigned events
    let query = supabase
      .from(TABLES.REP_QUESTS)
      .select("*, event:events(id, name, slug)")
      .eq("org_id", ORG_ID)
      .eq("status", statusFilter)
      .order("created_at", { ascending: false });

    if (eventIds.length > 0) {
      query = query.or(
        `event_id.is.null,event_id.in.(${eventIds.join(",")})`
      );
    } else {
      query = query.is("event_id", null);
    }

    const { data: quests, error } = await query;

    if (error) {
      console.error("[rep-portal/quests] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch quests" },
        { status: 500 }
      );
    }

    if (!quests || quests.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get the rep's submission counts per quest
    const questIds = quests.map((q: { id: string }) => q.id);
    const { data: submissions } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .select("quest_id, status")
      .eq("rep_id", repId)
      .eq("org_id", ORG_ID)
      .in("quest_id", questIds);

    // Build submission count map: { quest_id: { total, approved, pending, rejected } }
    const submissionMap: Record<
      string,
      { total: number; approved: number; pending: number; rejected: number }
    > = {};

    for (const sub of submissions || []) {
      const s = sub as { quest_id: string; status: string };
      if (!submissionMap[s.quest_id]) {
        submissionMap[s.quest_id] = {
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
        };
      }
      submissionMap[s.quest_id].total++;
      if (s.status === "approved") submissionMap[s.quest_id].approved++;
      if (s.status === "pending") submissionMap[s.quest_id].pending++;
      if (s.status === "rejected") submissionMap[s.quest_id].rejected++;
    }

    // Attach submission counts to quests
    const questsWithCounts = quests.map((q: { id: string }) => ({
      ...q,
      my_submissions: submissionMap[q.id] || {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
      },
    }));

    return NextResponse.json({ data: questsWithCounts });
  } catch (err) {
    console.error("[rep-portal/quests] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
