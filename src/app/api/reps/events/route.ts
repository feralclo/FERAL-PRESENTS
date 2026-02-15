import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { createRepDiscountCode } from "@/lib/discount-codes";

/**
 * GET /api/reps/events — List rep-event assignments
 * Optional filters: ?rep_id= or ?event_id=
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const repId = searchParams.get("rep_id");
    const eventId = searchParams.get("event_id");

    let query = supabase
      .from(TABLES.REP_EVENTS)
      .select(
        "*, rep:reps(id, first_name, last_name, display_name, email, photo_url, status), event:events(id, name, slug, date_start, status)"
      )
      .eq("org_id", ORG_ID)
      .order("assigned_at", { ascending: false });

    if (repId) {
      query = query.eq("rep_id", repId);
    }

    if (eventId) {
      query = query.eq("event_id", eventId);
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

/**
 * POST /api/reps/events — Assign a rep to an event
 * Creates a discount code for this rep+event if one doesn't exist
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { rep_id, event_id } = body;

    if (!rep_id || !event_id) {
      return NextResponse.json(
        { error: "Missing required fields: rep_id, event_id" },
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

    // Verify rep exists
    const { data: rep, error: repErr } = await supabase
      .from(TABLES.REPS)
      .select("id, first_name")
      .eq("id", rep_id)
      .eq("org_id", ORG_ID)
      .single();

    if (repErr || !rep) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // Verify event exists
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("id", event_id)
      .eq("org_id", ORG_ID)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("id")
      .eq("org_id", ORG_ID)
      .eq("rep_id", rep_id)
      .eq("event_id", event_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Rep is already assigned to this event" },
        { status: 409 }
      );
    }

    // Check if a discount already exists for this rep + event
    let discountId: string | null = null;
    const { data: existingDiscount } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id")
      .eq("org_id", ORG_ID)
      .eq("rep_id", rep_id)
      .contains("applicable_event_ids", [event_id])
      .single();

    if (existingDiscount) {
      discountId = existingDiscount.id;
    } else {
      // Create a discount code for this rep + event (with collision retry)
      const newDiscount = await createRepDiscountCode({
        repId: rep_id,
        firstName: rep.first_name,
        applicableEventIds: [event_id],
        description: `Rep discount: ${rep.first_name} — ${event.name}`,
      });

      if (newDiscount) {
        discountId = newDiscount.id;
      }
    }

    // Create the assignment
    const { data, error } = await supabase
      .from(TABLES.REP_EVENTS)
      .insert({
        org_id: ORG_ID,
        rep_id,
        event_id,
        discount_id: discountId,
        sales_count: 0,
        revenue: 0,
      })
      .select(
        "*, rep:reps(id, first_name, last_name, display_name, email, photo_url, status), event:events(id, name, slug, date_start, status)"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
