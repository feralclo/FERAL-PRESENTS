import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/quests/[id]/submissions — List submissions for a quest
 * Optional filter: ?status=pending
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .select(
        "*, rep:reps(id, first_name, last_name, display_name, email, photo_url)"
      )
      .eq("org_id", orgId)
      .eq("quest_id", id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) {
      if (!["pending", "approved", "rejected"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
      }
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
