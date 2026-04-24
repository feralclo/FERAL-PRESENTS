import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * Platform-owner-only CRUD for Entry Market vendors.
 *
 * Vendors are curated suppliers (FERAL CLOTHING today, others later).
 * Products FK to exactly one vendor — `platform_market_products.vendor_id`.
 *
 * GET   — list all vendors (includes hidden).
 * POST  — create a new vendor. Requires name + handle.
 */

interface VendorBody {
  name?: string;
  handle?: string;
  tagline?: string | null;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  website_url?: string | null;
  external_source?: "shopify" | "manual";
  external_shop_domain?: string | null;
  visible?: boolean;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

const URL_RE = /^https?:\/\/\S+$/i;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

function validateVendorPayload(
  body: VendorBody,
  { partial }: { partial: boolean }
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  const out: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const n = typeof body.name === "string" ? body.name.trim() : "";
    if (!n || n.length > 120) return { ok: false, error: "name required (1–120 chars)" };
    out.name = n;
  } else if (!partial) {
    return { ok: false, error: "name is required" };
  }

  if (body.handle !== undefined) {
    const h = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
    if (!HANDLE_RE.test(h)) {
      return {
        ok: false,
        error: "handle must be lowercase letters/numbers/hyphens, 2–60 chars",
      };
    }
    out.handle = h;
  } else if (!partial) {
    return { ok: false, error: "handle is required" };
  }

  if (body.tagline !== undefined) out.tagline = body.tagline?.toString().slice(0, 200) || null;
  if (body.description !== undefined) out.description = body.description?.toString().slice(0, 2000) || null;

  for (const field of ["logo_url", "cover_url", "website_url"] as const) {
    const raw = body[field];
    if (raw !== undefined) {
      if (raw === null || raw === "") {
        out[field] = null;
      } else if (typeof raw !== "string" || !URL_RE.test(raw) || raw.length > 2000) {
        return { ok: false, error: `${field} must be a valid URL or null` };
      } else {
        out[field] = raw;
      }
    }
  }

  if (body.external_source !== undefined) {
    if (body.external_source !== "shopify" && body.external_source !== "manual") {
      return { ok: false, error: "external_source must be 'shopify' or 'manual'" };
    }
    out.external_source = body.external_source;
  }
  if (body.external_shop_domain !== undefined) {
    out.external_shop_domain = body.external_shop_domain?.toString().slice(0, 200) || null;
  }
  if (body.visible !== undefined) out.visible = Boolean(body.visible);
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(body.sort_order)) return { ok: false, error: "sort_order must be an integer" };
    out.sort_order = body.sort_order;
  }
  if (body.metadata !== undefined) {
    if (body.metadata && typeof body.metadata !== "object") {
      return { ok: false, error: "metadata must be an object" };
    }
    out.metadata = body.metadata ?? {};
  }

  return { ok: true, payload: out };
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data, error } = await db
      .from("platform_market_vendors")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    let body: VendorBody;
    try {
      body = (await request.json()) as VendorBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validated = validateVendorPayload(body, { partial: false });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data, error } = await db
      .from("platform_market_vendors")
      .insert(validated.payload)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A vendor with that handle already exists" },
          { status: 409 }
        );
      }
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export { validateVendorPayload };
