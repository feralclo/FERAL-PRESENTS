import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/quests/submissions — Rep's own submissions (protected)
 *
 * Returns the current rep's quest submissions with joined quest info.
 * Optionally filtered by quest_id and/or status.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const questId = searchParams.get("quest_id");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50", 10)), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .select(
        "*, quest:rep_quests(id, title, description, quest_type, points_reward, image_url, event_id, event:events(id, name))",
        { count: "exact" }
      )
      .eq("rep_id", repId)
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (questId) {
      query = query.eq("quest_id", questId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[rep-portal/quests/submissions] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch submissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[rep-portal/quests/submissions] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
