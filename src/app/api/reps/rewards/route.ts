import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

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
  } catch (err) {
    Sentry.captureException(err);
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
      reward_type: rawRewardType,
      points_cost,
      ep_cost,
      xp_threshold,
      product_id,
      custom_value,
      total_available,
      stock,
      fulfillment_kind,
      status = "active",
      metadata,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    // Normalise reward_type — accept the legacy 'points_shop' name that old
    // clients might still send, coerce to the new 'shop' value that the DB
    // CHECK constraint now enforces.
    const reward_type =
      rawRewardType === "points_shop" ? "shop" : rawRewardType;
    if (!reward_type || !["milestone", "shop", "manual"].includes(reward_type)) {
      return NextResponse.json(
        { error: "reward_type must be 'milestone', 'shop', or 'manual'" },
        { status: 400 }
      );
    }

    if (!["active", "archived"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'active' or 'archived'" },
        { status: 400 }
      );
    }

    if (
      fulfillment_kind != null &&
      !["digital_ticket", "guest_list", "merch", "custom"].includes(
        fulfillment_kind
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

    // Accept either ep_cost or points_cost; store both so v1 web queries see
    // the same number. Same for stock / total_available.
    const effectiveEp = ep_cost != null ? Number(ep_cost) : points_cost != null ? Number(points_cost) : null;
    const effectiveStock =
      stock != null ? Number(stock) : total_available != null ? Number(total_available) : null;

    // Shop rewards need an EP cost; milestones need an xp threshold —
    // enforce up front so the DB CHECK never trips.
    if (reward_type === "shop" && (!effectiveEp || effectiveEp <= 0)) {
      return NextResponse.json(
        { error: "Shop rewards require ep_cost > 0" },
        { status: 400 }
      );
    }
    const effectiveXpThreshold =
      xp_threshold != null
        ? Number(xp_threshold)
        : reward_type === "milestone" && points_cost != null
        ? Number(points_cost)
        : null;
    if (
      reward_type === "milestone" &&
      (!effectiveXpThreshold || effectiveXpThreshold <= 0)
    ) {
      return NextResponse.json(
        { error: "Milestone rewards require xp_threshold > 0" },
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
        points_cost: effectiveEp ?? effectiveXpThreshold,  // legacy field
        ep_cost: effectiveEp,
        xp_threshold: effectiveXpThreshold,
        product_id: product_id || null,
        custom_value: custom_value?.trim() || null,
        total_available: effectiveStock,  // legacy field
        stock: effectiveStock,
        fulfillment_kind: fulfillment_kind || null,
        total_claimed: 0,
        status,
        ...(metadata && typeof metadata === "object" ? { metadata } : {}),
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/reps/rewards] Supabase error:", error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[POST /api/reps/rewards] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
