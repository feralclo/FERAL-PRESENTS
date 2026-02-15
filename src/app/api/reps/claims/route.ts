import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/claims — List reward claims
 * Optional filters: ?status=&rep_id=
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
    const status = searchParams.get("status");
    const repId = searchParams.get("rep_id");

    let query = supabase
      .from(TABLES.REP_REWARD_CLAIMS)
      .select(
        "*, reward:rep_rewards(id, name, description, image_url, reward_type, points_cost), rep:reps(id, first_name, last_name, display_name, email, photo_url)"
      )
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) {
      if (!["pending", "fulfilled", "cancelled"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
      }
      query = query.eq("status", status);
    }

    if (repId) {
      query = query.eq("rep_id", repId);
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
 * POST /api/reps/claims — Manual award (admin grants reward to a rep)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { rep_id, reward_id, notes } = body;

    if (!rep_id || !reward_id) {
      return NextResponse.json(
        { error: "Missing required fields: rep_id, reward_id" },
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
      .select("id")
      .eq("id", rep_id)
      .eq("org_id", ORG_ID)
      .single();

    if (repErr || !rep) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // Verify reward exists
    const { data: reward, error: rewardErr } = await supabase
      .from(TABLES.REP_REWARDS)
      .select("id, total_available, total_claimed")
      .eq("id", reward_id)
      .eq("org_id", ORG_ID)
      .single();

    if (rewardErr || !reward) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    // Check availability
    if (
      reward.total_available !== null &&
      reward.total_claimed >= reward.total_available
    ) {
      return NextResponse.json(
        { error: "No more rewards available" },
        { status: 400 }
      );
    }

    // Create the claim
    const { data, error } = await supabase
      .from(TABLES.REP_REWARD_CLAIMS)
      .insert({
        org_id: ORG_ID,
        rep_id,
        reward_id,
        claim_type: "manual" as const,
        points_spent: 0,
        status: "fulfilled" as const,
        fulfilled_at: new Date().toISOString(),
        fulfilled_by: auth.user!.id,
        notes: notes?.trim() || null,
      })
      .select(
        "*, reward:rep_rewards(id, name, description, image_url, reward_type, points_cost), rep:reps(id, first_name, last_name, display_name, email, photo_url)"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Increment total_claimed on the reward
    await supabase
      .from(TABLES.REP_REWARDS)
      .update({
        total_claimed: reward.total_claimed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reward_id)
      .eq("org_id", ORG_ID);

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
