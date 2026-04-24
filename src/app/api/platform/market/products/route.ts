import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * Platform-owner-only admin for the Entry Market catalog.
 * Tenants DO NOT SEE this surface — no tenant-admin equivalent.
 *
 * GET  — list all products, including hidden, newest first.
 * POST — create a product. Fields are hand-entered for v1; when the live
 *        Shopify integration lands the admin UI will gain a "paste URL →
 *        prefill" action that fetches from Shopify before POSTing here.
 */

interface ProductBody {
  title?: string;
  subtitle?: string;
  description?: string;
  category?: string;
  image_urls?: string[];
  ep_price?: number;
  stock?: number | null;
  visible?: boolean;
  sort_order?: number;
  source?: "shopify" | "manual";
  external_product_id?: string | null;
  external_variant_id?: string | null;
  external_url?: string | null;
  metadata?: Record<string, unknown>;
}

const URL_RE = /^https?:\/\/\S+$/i;

function validateProductPayload(
  body: ProductBody,
  { partial = false }: { partial?: boolean } = {}
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  const out: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t || t.length > 200) return { ok: false, error: "title required (1–200 chars)" };
    out.title = t;
  } else if (!partial) {
    return { ok: false, error: "title is required" };
  }

  if (body.subtitle !== undefined) out.subtitle = body.subtitle?.toString().slice(0, 200) || null;
  if (body.description !== undefined) out.description = body.description?.toString().slice(0, 5000) || null;
  if (body.category !== undefined) out.category = body.category?.toString().slice(0, 60) || null;

  if (body.image_urls !== undefined) {
    if (!Array.isArray(body.image_urls)) return { ok: false, error: "image_urls must be an array" };
    const clean = body.image_urls.filter((u) => typeof u === "string" && URL_RE.test(u) && u.length <= 2000);
    if (clean.length === 0 && !partial) {
      return { ok: false, error: "image_urls must contain at least one valid URL" };
    }
    out.image_urls = clean;
  } else if (!partial) {
    return { ok: false, error: "image_urls is required" };
  }

  if (body.ep_price !== undefined) {
    if (!Number.isInteger(body.ep_price) || (body.ep_price ?? 0) <= 0) {
      return { ok: false, error: "ep_price must be a positive integer" };
    }
    out.ep_price = body.ep_price;
  } else if (!partial) {
    return { ok: false, error: "ep_price is required" };
  }

  if (body.stock !== undefined) {
    if (body.stock === null) {
      out.stock = null;
    } else if (Number.isInteger(body.stock) && (body.stock as number) >= 0) {
      out.stock = body.stock;
    } else {
      return { ok: false, error: "stock must be a non-negative integer or null (unlimited)" };
    }
  }

  if (body.visible !== undefined) out.visible = Boolean(body.visible);
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(body.sort_order)) return { ok: false, error: "sort_order must be an integer" };
    out.sort_order = body.sort_order;
  }
  if (body.source !== undefined) {
    if (body.source !== "shopify" && body.source !== "manual") {
      return { ok: false, error: "source must be 'shopify' or 'manual'" };
    }
    out.source = body.source;
  }
  if (body.external_product_id !== undefined) {
    out.external_product_id = body.external_product_id?.toString().slice(0, 200) || null;
  }
  if (body.external_variant_id !== undefined) {
    out.external_variant_id = body.external_variant_id?.toString().slice(0, 200) || null;
  }
  if (body.external_url !== undefined) {
    if (body.external_url && !URL_RE.test(body.external_url)) {
      return { ok: false, error: "external_url must be a valid URL" };
    }
    out.external_url = body.external_url || null;
  }
  if (body.metadata !== undefined) {
    if (body.metadata && typeof body.metadata !== "object") {
      return { ok: false, error: "metadata must be an object" };
    }
    out.metadata = body.metadata ?? {};
  }

  return { ok: true, payload: out };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url);

    const { data, error, count } = await db
      .from("platform_market_products")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? (data ?? []).length;
    return NextResponse.json({
      data: data ?? [],
      total,
      limit,
      offset,
      has_more: offset + (data ?? []).length < total,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[platform/market/products GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    let body: ProductBody;
    try {
      body = (await request.json()) as ProductBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validated = validateProductPayload(body, { partial: false });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data, error } = await db
      .from("platform_market_products")
      .insert({
        ...validated.payload,
        source: validated.payload.source ?? "shopify",
      })
      .select("*")
      .single();

    if (error) {
      Sentry.captureException(error);
      // Hoist constraint violations (unique external id) to a clearer 409
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A product with that source/external_product_id already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[platform/market/products POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export { validateProductPayload };
