import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/milestones — List milestones
 * Optional filter: ?reward_id=
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

    const rewardId = request.nextUrl.searchParams.get("reward_id");

    let query = supabase
      .from(TABLES.REP_MILESTONES)
      .select("*, reward:rep_rewards(id, name), event:events(name)")
      .eq("org_id", ORG_ID)
      .order("sort_order", { ascending: true });

    if (rewardId) {
      query = query.eq("reward_id", rewardId);
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
 * POST /api/reps/milestones — Create a milestone
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const {
      reward_id,
      milestone_type,
      threshold_value,
      event_id,
      title,
      description,
      sort_order = 0,
    } = body;

    if (!reward_id || !milestone_type || threshold_value == null || !title) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: reward_id, milestone_type, threshold_value, title",
        },
        { status: 400 }
      );
    }

    if (!["sales_count", "revenue", "points"].includes(milestone_type)) {
      return NextResponse.json(
        { error: "milestone_type must be 'sales_count', 'revenue', or 'points'" },
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

    // Verify reward exists
    const { data: reward, error: rewardErr } = await supabase
      .from(TABLES.REP_REWARDS)
      .select("id")
      .eq("id", reward_id)
      .eq("org_id", ORG_ID)
      .single();

    if (rewardErr || !reward) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_MILESTONES)
      .insert({
        org_id: ORG_ID,
        reward_id,
        milestone_type,
        threshold_value: Number(threshold_value),
        event_id: event_id || null,
        title: title.trim(),
        description: description?.trim() || null,
        sort_order: Number(sort_order),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
