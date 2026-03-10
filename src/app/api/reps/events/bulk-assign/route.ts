import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { autoAssignAllRepsToEvent } from "@/lib/rep-utils";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/reps/events/bulk-assign — Assign all active reps to an event
 * Body: { event_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const { event_id } = body;

    if (!event_id) {
      return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Verify event exists
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("id", event_id)
      .eq("org_id", orgId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const result = await autoAssignAllRepsToEvent({
      supabase,
      eventId: event_id,
      eventName: event.name,
      orgId,
    });

    return NextResponse.json({
      data: { assigned: result.assigned },
      message: result.assigned > 0
        ? `${result.assigned} rep${result.assigned === 1 ? "" : "s"} assigned`
        : "All reps are already assigned",
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
