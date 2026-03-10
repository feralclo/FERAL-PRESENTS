import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getOrCreateRepDiscount } from "@/lib/discount-codes";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/join-event — Rep self-assigns to an event
 *
 * Body: { eventId }
 * Creates the rep_events assignment and links the rep's discount code.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const body = await request.json();
    const { eventId } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Verify event exists and belongs to rep's org
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, status")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .in("status", ["published", "active", "live"])
      .single();

    if (!event) {
      return NextResponse.json(
        { error: "Event not found or not available" },
        { status: 404 }
      );
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("id")
      .eq("rep_id", repId)
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Already joined this event" },
        { status: 409 }
      );
    }

    // Get rep details for discount code
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("first_name, display_name")
      .eq("id", repId)
      .single();

    // Get or create discount
    const discount = await getOrCreateRepDiscount({
      repId,
      orgId,
      firstName: rep?.first_name || "Rep",
      displayName: rep?.display_name,
    });

    // Create the assignment
    const { error } = await supabase
      .from(TABLES.REP_EVENTS)
      .insert({
        org_id: orgId,
        rep_id: repId,
        event_id: eventId,
        discount_id: discount?.id || null,
        sales_count: 0,
        revenue: 0,
      });

    if (error) {
      console.error("[rep-portal/join-event] Insert error:", error);
      return NextResponse.json(
        { error: "Failed to join event" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        event_id: eventId,
        event_name: event.name,
        discount_code: discount?.code || null,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/join-event] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
