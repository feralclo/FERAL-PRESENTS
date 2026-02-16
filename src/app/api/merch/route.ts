import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/merch — List all merch for the org (public for frontend resolution)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from(TABLES.PRODUCTS)
      .select("*")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false });

    if (status) {
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
 * POST /api/merch — Create a new merch item (auth required)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const {
      name,
      description,
      type = "T-Shirt",
      sizes = [],
      price = 0,
      images = {},
      status = "draft",
      sku,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
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
      .from(TABLES.PRODUCTS)
      .insert({
        org_id: ORG_ID,
        name,
        description: description || null,
        type,
        sizes,
        price: Number(price),
        images,
        status,
        sku: sku || null,
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
