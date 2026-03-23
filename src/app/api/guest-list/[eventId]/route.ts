import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

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
    const orgId = auth.orgId;

    const { eventId } = await params;
    const supabase = await getSupabaseAdmin();
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
      .eq("org_id", orgId)
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

    // Status counts for filter tabs
    const statusCounts: Record<string, number> = {};
    for (const e of entries) {
      const s = (e as { status?: string }).status || "confirmed";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return NextResponse.json({
      data: entries,
      summary: {
        total_entries: entries.length,
        total_guests: totalGuests,
        checked_in: checkedIn,
        status_counts: statusCounts,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
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
    const orgId = auth.orgId;

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing entry id" },
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

    // If checking in, set timestamp and fetch current count from DB
    if (updates.checked_in === true) {
      updates.checked_in_at = new Date().toISOString();
      // Get current count from DB rather than trusting client value
      const { data: current } = await supabase
        .from(TABLES.GUEST_LIST)
        .select("checked_in_count")
        .eq("id", id)
        .eq("org_id", orgId)
        .single();
      updates.checked_in_count = ((current?.checked_in_count as number) || 0) + 1;
    }

    const { data, error } = await supabase
      .from(TABLES.GUEST_LIST)
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
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
    const orgId = auth.orgId;

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing entry id" },
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

    const { error } = await supabase
      .from(TABLES.GUEST_LIST)
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
