import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/events/leaderboard/[eventId]/rewards
 * Returns position rewards configured for this event's leaderboard.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { eventId } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data, error } = await supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .select("*, reward:rep_rewards(id, name, image_url), awarded_rep:reps(id, display_name, first_name, photo_url)")
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId)
      .order("position", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/reps/events/leaderboard/[eventId]/rewards
 * Set/update position rewards for an event leaderboard.
 *
 * Body: { rewards: [{ position: 1, reward_name: "VIP Pass", reward_id?: string }, ...] }
 * Upserts rows — removes positions not in the array.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { eventId } = await params;
    const body = await request.json();
    const rewards: { position: number; reward_name: string; reward_id?: string | null }[] =
      body.rewards || [];

    if (!Array.isArray(rewards)) {
      return NextResponse.json({ error: "rewards must be an array" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Verify event exists
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id")
      .eq("id", eventId)
      .eq("org_id", ORG_ID)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if leaderboard is already locked (any position has awarded_rep_id)
    const { data: existing } = await supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .select("id, awarded_rep_id")
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId);

    const isLocked = (existing || []).some((r) => r.awarded_rep_id !== null);
    if (isLocked) {
      return NextResponse.json(
        { error: "Cannot modify rewards — leaderboard is locked" },
        { status: 400 }
      );
    }

    // Delete existing position rewards for this event
    await supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .delete()
      .eq("org_id", ORG_ID)
      .eq("event_id", eventId);

    if (rewards.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Insert new position rewards
    const rows = rewards.map((r) => ({
      org_id: ORG_ID,
      event_id: eventId,
      position: r.position,
      reward_name: r.reward_name || "",
      reward_id: r.reward_id || null,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from(TABLES.REP_EVENT_POSITION_REWARDS)
      .insert(rows)
      .select("*")
      .order("position", { ascending: true });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: inserted });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
