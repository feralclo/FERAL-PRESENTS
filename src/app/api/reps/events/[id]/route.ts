import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * DELETE /api/reps/events/[id] — Remove a rep-event assignment by assignment ID
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Verify the assignment exists
    const { data: assignment, error: fetchErr } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("id")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (fetchErr || !assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from(TABLES.REP_EVENTS)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
