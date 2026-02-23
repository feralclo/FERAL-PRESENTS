import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/rewards — List all rewards
 * Optional filter: ?status=active
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from(TABLES.REP_REWARDS)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) {
      if (!["active", "archived"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
      }
      query = query.eq("status", status);
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
 * POST /api/reps/rewards — Create a reward
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      name,
      description,
      image_url,
      reward_type,
      points_cost,
      product_id,
      custom_value,
      total_available,
      status = "active",
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    if (!reward_type || !["milestone", "points_shop", "manual"].includes(reward_type)) {
      return NextResponse.json(
        { error: "reward_type must be 'milestone', 'points_shop', or 'manual'" },
        { status: 400 }
      );
    }

    if (!["active", "archived"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'active' or 'archived'" },
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

    const { data, error } = await supabase
      .from(TABLES.REP_REWARDS)
      .insert({
        org_id: orgId,
        name: name.trim(),
        description: description?.trim() || null,
        image_url: image_url || null,
        reward_type,
        points_cost: points_cost != null ? Number(points_cost) : null,
        product_id: product_id || null,
        custom_value: custom_value?.trim() || null,
        total_available: total_available != null ? Number(total_available) : null,
        total_claimed: 0,
        status,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/reps/rewards] Supabase error:", error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/reps/rewards] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
