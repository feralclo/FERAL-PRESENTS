import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { validateVendorPayload } from "../route";

/**
 * GET    /api/platform/market/vendors/:id   — single vendor
 * PATCH  /api/platform/market/vendors/:id   — partial update
 * DELETE /api/platform/market/vendors/:id   — remove. Blocked at the DB
 *   level (ON DELETE RESTRICT on the products FK) when any product still
 *   references this vendor. Hide via PATCH { visible: false } instead.
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
      .from("platform_market_vendors")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

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

    const validated = validateVendorPayload(body, { partial: true });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    if (Object.keys(validated.payload).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data, error } = await db
      .from("platform_market_vendors")
      .update(validated.payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
      }
      if (error.code === "23505") {
        return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
      }
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
      .from("platform_market_vendors")
      .delete()
      .eq("id", id);

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              "Vendor has products attached and cannot be deleted. PATCH { visible: false } to hide it.",
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
