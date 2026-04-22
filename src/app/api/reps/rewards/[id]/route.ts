import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

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
    const orgId = auth.orgId;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
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
      .eq("org_id", orgId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Reward not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
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
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();

    const supabase = await getSupabaseAdmin();
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
      "ep_cost",
      "xp_threshold",
      "product_id",
      "custom_value",
      "total_available",
      "stock",
      "fulfillment_kind",
      "status",
      "metadata",
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

    // Dual-write: if the caller updated ep_cost, mirror to points_cost so the
    // legacy web UI stays consistent; same for stock ↔ total_available.
    if (updates.ep_cost !== undefined && updates.points_cost === undefined) {
      updates.points_cost = updates.ep_cost;
    }
    if (updates.stock !== undefined && updates.total_available === undefined) {
      updates.total_available = updates.stock;
    }

    // Validate enums if provided. Accept both legacy 'points_shop' and new
    // 'shop' for reward_type; the DB CHECK now only allows 'shop'.
    if (updates.reward_type) {
      if (updates.reward_type === "points_shop") {
        updates.reward_type = "shop";
      }
      if (!["milestone", "shop", "manual"].includes(updates.reward_type as string)) {
        return NextResponse.json(
          { error: "reward_type must be 'milestone', 'shop', or 'manual'" },
          { status: 400 }
        );
      }
    }
    if (updates.fulfillment_kind !== undefined && updates.fulfillment_kind !== null) {
      if (
        !["digital_ticket", "guest_list", "merch", "custom"].includes(
          updates.fulfillment_kind as string
        )
      ) {
        return NextResponse.json(
          {
            error:
              "fulfillment_kind must be 'digital_ticket', 'guest_list', 'merch', or 'custom'",
          },
          { status: 400 }
        );
      }
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
      .eq("org_id", orgId)
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
  } catch (err) {
    Sentry.captureException(err);
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
    const orgId = auth.orgId;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
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
      .eq("org_id", orgId)
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
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
