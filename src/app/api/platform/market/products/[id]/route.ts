import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { validateProductPayload } from "../route";

/**
 * GET    /api/platform/market/products/:id — single product (includes hidden)
 * PATCH  /api/platform/market/products/:id — partial update (price, visibility, stock, etc.)
 * DELETE /api/platform/market/products/:id — remove from catalog.
 *   Delete is RESTRICTED at the DB level when claims exist — use PATCH
 *   { visible: false } if the product has been redeemed. The DELETE
 *   response maps 23503 (FK) to a 409 with a clear hint.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data, error } = await db
      .from("platform_market_products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validated = validateProductPayload(body, { partial: true });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    // PATCH at this endpoint touches only the product row. Variant edits
    // go through /platform/market/products/:id/variants/:variant_id (a
    // separate concern with its own cache/stock semantics).
    if (Object.keys(validated.productPayload).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data, error } = await db
      .from("platform_market_products")
      .update(validated.productPayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { error } = await db
      .from("platform_market_products")
      .delete()
      .eq("id", id);

    if (error) {
      // FK violation → claims exist. Point the caller at the right affordance.
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              "Product has existing claims and cannot be deleted. PATCH { visible: false } to hide it instead.",
          },
          { status: 409 }
        );
      }
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
