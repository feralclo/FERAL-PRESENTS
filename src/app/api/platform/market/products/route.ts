import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * Platform-owner-only admin for the Entry Market catalog.
 * Tenants do NOT see this surface.
 *
 * GET  — list products (includes hidden + variants), newest first.
 * POST — create a product + its variants in one call.
 *
 * A product row is pure editorial (title/images/description). All
 * commerce state (price, stock, sku) lives on the variant rows.
 */

interface VariantInput {
  title: string;
  external_variant_id: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  ep_price: number;
  stock?: number | null;
  visible?: boolean;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

interface ProductBody {
  title?: string;
  subtitle?: string;
  description?: string;
  category?: string;
  image_urls?: string[];
  visible?: boolean;
  sort_order?: number;
  source?: "shopify" | "manual";
  external_product_id?: string | null;
  external_url?: string | null;
  metadata?: Record<string, unknown>;
  variants?: VariantInput[];
}

const URL_RE = /^https?:\/\/\S+$/i;

function validateProductPayload(
  body: ProductBody,
  { partial = false }: { partial?: boolean } = {}
):
  | { ok: true; productPayload: Record<string, unknown>; variants?: VariantInput[] }
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

  // Variants — required on create, optional on patch
  if (body.variants !== undefined) {
    if (!Array.isArray(body.variants) || body.variants.length === 0) {
      return { ok: false, error: "variants must be a non-empty array" };
    }
    const seen = new Set<string>();
    for (const v of body.variants) {
      if (!v || typeof v !== "object") return { ok: false, error: "each variant must be an object" };
      if (!v.title || typeof v.title !== "string" || v.title.length > 100) {
        return { ok: false, error: "variant.title required (<=100 chars)" };
      }
      if (!v.external_variant_id || typeof v.external_variant_id !== "string") {
        return { ok: false, error: "variant.external_variant_id required" };
      }
      if (seen.has(v.external_variant_id)) {
        return { ok: false, error: `duplicate external_variant_id: ${v.external_variant_id}` };
      }
      seen.add(v.external_variant_id);
      if (!Number.isInteger(v.ep_price) || v.ep_price <= 0) {
        return { ok: false, error: "variant.ep_price must be a positive integer" };
      }
      if (v.stock !== undefined && v.stock !== null && (!Number.isInteger(v.stock) || (v.stock as number) < 0)) {
        return { ok: false, error: "variant.stock must be a non-negative integer or null" };
      }
    }
    return { ok: true, productPayload: out, variants: body.variants };
  }
  if (!partial && body.variants === undefined) {
    return { ok: false, error: "variants is required (at least one)" };
  }

  return { ok: true, productPayload: out };
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
      .select(
        `*, variants:platform_market_product_variants(id, title, option1, option2, option3, external_variant_id, ep_price, stock, visible, sort_order, metadata, created_at, updated_at)`,
        { count: "exact" }
      )
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

    // Insert product
    const { data: product, error: productError } = await db
      .from("platform_market_products")
      .insert({
        ...validated.productPayload,
        source: validated.productPayload.source ?? "shopify",
      })
      .select("*")
      .single();

    if (productError) {
      Sentry.captureException(productError);
      if (productError.code === "23505") {
        return NextResponse.json(
          { error: "A product with that source/external_product_id already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }

    // Insert variants
    const variantRows = (validated.variants ?? []).map((v, i) => ({
      product_id: product.id,
      title: v.title,
      external_variant_id: v.external_variant_id,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
      ep_price: v.ep_price,
      stock: v.stock ?? null,
      visible: v.visible ?? true,
      sort_order: v.sort_order ?? (i + 1) * 10,
      metadata: v.metadata ?? {},
    }));

    const { data: variants, error: variantError } = await db
      .from("platform_market_product_variants")
      .insert(variantRows)
      .select("*");

    if (variantError) {
      // Rollback the product — insertion was all-or-nothing from the
      // caller's perspective. Supabase doesn't give us a transaction
      // across two tables here, so we delete the orphaned product row.
      Sentry.captureException(variantError, { extra: { productId: product.id } });
      await db.from("platform_market_products").delete().eq("id", product.id);
      return NextResponse.json(
        { error: `Variant insert failed: ${variantError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { ...product, variants } },
      { status: 201 }
    );
  } catch (err) {
    Sentry.captureException(err);
    console.error("[platform/market/products POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export { validateProductPayload };
