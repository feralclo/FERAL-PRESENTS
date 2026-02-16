import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/discounts/[id] — Get a single discount (admin auth required)
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await context.params;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("*")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/discounts/[id] — Update a discount (admin auth required)
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const body = await request.json();

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Validate type if provided
    if (body.type && !["percentage", "fixed"].includes(body.type)) {
      return NextResponse.json(
        { error: "Type must be 'percentage' or 'fixed'" },
        { status: 400 }
      );
    }

    if (body.value != null && (typeof body.value !== "number" || body.value < 0)) {
      return NextResponse.json(
        { error: "Value must be a non-negative number" },
        { status: 400 }
      );
    }

    if (body.type === "percentage" && body.value > 100) {
      return NextResponse.json(
        { error: "Percentage discount cannot exceed 100%" },
        { status: 400 }
      );
    }

    // If code is being changed, check for duplicates
    if (body.code) {
      const { data: existing } = await supabase
        .from(TABLES.DISCOUNTS)
        .select("id")
        .eq("org_id", ORG_ID)
        .ilike("code", body.code.trim())
        .neq("id", id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "A discount with this code already exists" },
          { status: 409 }
        );
      }
    }

    // Build update payload — only include fields that were sent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.code != null) update.code = body.code.trim().toUpperCase();
    if (body.description !== undefined) update.description = body.description || null;
    if (body.type != null) update.type = body.type;
    if (body.value != null) update.value = Number(body.value);
    if (body.min_order_amount !== undefined)
      update.min_order_amount = body.min_order_amount != null ? Number(body.min_order_amount) : null;
    if (body.max_uses !== undefined)
      update.max_uses = body.max_uses != null ? Number(body.max_uses) : null;
    if (body.applicable_event_ids !== undefined)
      update.applicable_event_ids = body.applicable_event_ids || null;
    if (body.starts_at !== undefined) update.starts_at = body.starts_at || null;
    if (body.expires_at !== undefined) update.expires_at = body.expires_at || null;
    if (body.status != null) update.status = body.status;

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .update(update)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Discount not found" },
        { status: error ? 500 : 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/discounts/[id] — Delete a discount (admin auth required)
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await context.params;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { error } = await supabase
      .from(TABLES.DISCOUNTS)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
