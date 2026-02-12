import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/guest-list/[eventId] — Get guest list for an event
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { eventId } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*")
      .eq("event_id", eventId)
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Summary stats
    const entries = data || [];
    const totalGuests = entries.reduce(
      (sum: number, e: { qty: number }) => sum + e.qty,
      0
    );
    const checkedIn = entries.filter(
      (e: { checked_in: boolean }) => e.checked_in
    ).length;

    return NextResponse.json({
      data: entries,
      summary: {
        total_entries: entries.length,
        total_guests: totalGuests,
        checked_in: checkedIn,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/guest-list/[eventId] — Update a guest list entry (check-in, edit)
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing entry id" },
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

    // If checking in, set timestamp
    if (updates.checked_in === true) {
      updates.checked_in_at = new Date().toISOString();
      updates.checked_in_count = (updates.checked_in_count || 0) + 1;
    }

    const { data, error } = await supabase
      .from(TABLES.GUEST_LIST)
      .update(updates)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/guest-list/[eventId] — Delete a guest list entry
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing entry id" },
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

    const { error } = await supabase
      .from(TABLES.GUEST_LIST)
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
