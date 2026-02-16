import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/discounts — List all discounts for the org (admin auth required)
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("*")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/discounts — Create a new discount (admin auth required)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const {
      code,
      description,
      type = "percentage",
      value = 0,
      min_order_amount,
      max_uses,
      applicable_event_ids,
      starts_at,
      expires_at,
      status = "active",
    } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { error: "Missing required field: code" },
        { status: 400 }
      );
    }

    if (!["percentage", "fixed"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'percentage' or 'fixed'" },
        { status: 400 }
      );
    }

    if (typeof value !== "number" || value < 0) {
      return NextResponse.json(
        { error: "Value must be a non-negative number" },
        { status: 400 }
      );
    }

    if (type === "percentage" && value > 100) {
      return NextResponse.json(
        { error: "Percentage discount cannot exceed 100%" },
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

    // Check for duplicate code (case-insensitive)
    const { data: existing } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id")
      .eq("org_id", ORG_ID)
      .ilike("code", code.trim())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "A discount with this code already exists" },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .insert({
        org_id: ORG_ID,
        code: code.trim().toUpperCase(),
        description: description || null,
        type,
        value: Number(value),
        min_order_amount: min_order_amount != null ? Number(min_order_amount) : null,
        max_uses: max_uses != null ? Number(max_uses) : null,
        used_count: 0,
        applicable_event_ids: applicable_event_ids || null,
        starts_at: starts_at || null,
        expires_at: expires_at || null,
        status,
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
