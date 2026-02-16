import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/merch/[id] — Get a single merch item (public)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.PRODUCTS)
      .select("*")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/merch/[id] — Update a merch item (auth required)
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

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const allowedFields = [
      "name",
      "description",
      "type",
      "sizes",
      "price",
      "images",
      "status",
      "sku",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if ("price" in body) {
      updateData.price = Number(body.price);
    }

    const { data, error } = await supabase
      .from(TABLES.PRODUCTS)
      .update(updateData)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/merch/[id] — Delete a merch item (auth required)
 * Prevents deletion if linked to active ticket types.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Check if product is linked to any active ticket types
    const { count } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("*", { count: "exact", head: true })
      .eq("product_id", id)
      .in("status", ["active", "hidden"]);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: product is linked to ${count} active ticket type${count > 1 ? "s" : ""}. Unlink them first.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from(TABLES.PRODUCTS)
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
