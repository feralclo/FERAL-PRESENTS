import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/rewards/[id] — Single reward with milestones joined
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_REWARDS)
      .select(
        "*, milestones:rep_milestones(*, event:events(name))"
      )
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/reps/rewards/[id] — Update reward fields
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

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const allowedFields = [
      "name",
      "description",
      "image_url",
      "reward_type",
      "points_cost",
      "product_id",
      "custom_value",
      "total_available",
      "status",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate enums if provided
    if (updates.reward_type && !["milestone", "points_shop", "manual"].includes(updates.reward_type as string)) {
      return NextResponse.json(
        { error: "reward_type must be 'milestone', 'points_shop', or 'manual'" },
        { status: 400 }
      );
    }
    if (updates.status && !["active", "archived"].includes(updates.status as string)) {
      return NextResponse.json(
        { error: "status must be 'active' or 'archived'" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.REP_REWARDS)
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
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/reps/rewards/[id] — Archive reward (set status to "archived")
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_REWARDS)
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
