import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * PUT /api/reps/milestones/[id] — Update a milestone
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

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const allowedFields = [
      "milestone_type",
      "threshold_value",
      "event_id",
      "title",
      "description",
      "sort_order",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Validate enums if provided
    if (updates.milestone_type && !["sales_count", "revenue", "points"].includes(updates.milestone_type as string)) {
      return NextResponse.json(
        { error: "milestone_type must be 'sales_count', 'revenue', or 'points'" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    // updated_at is always added, so check for >1 keys (i.e. at least one real field)
    if (Object.keys(updates).length < 2) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_MILESTONES)
      .update(updates)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/reps/milestones/[id] — Delete a milestone
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

    const { data: milestone, error: fetchErr } = await supabase
      .from(TABLES.REP_MILESTONES)
      .select("id")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (fetchErr || !milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from(TABLES.REP_MILESTONES)
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
