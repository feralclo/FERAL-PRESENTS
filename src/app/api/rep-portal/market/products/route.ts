import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getIntegrationStatus } from "@/lib/market/shopify";
import { parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/market/products
 *
 * Curated platform-level marketplace. Each product row returns its visible
 * variants (size / colour) inline so iOS can render a size picker without
 * a second round-trip. A product is only listed if it has at least one
 * visible + in-stock variant.
 *
 * Response row shape:
 *   {
 *     id, title, subtitle, description, category, image_urls,
 *     from_ep_price,        // cheapest visible variant — for list-view badge
 *     variants: [{ id, title, option1, option2, option3, ep_price, stock }],
 *     visible, sort_order
 *   }
 *
 * Query: ?limit=50 (1..100) &offset=0 &category=merch
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url);
    const category = url.searchParams.get("category");

    let query = db
      .from("platform_market_products")
      .select(
        `id, title, subtitle, description, category, image_urls, visible, sort_order, created_at,
         vendor:platform_market_vendors(id, name, handle, tagline, logo_url, website_url),
         variants:platform_market_product_variants(id, title, option1, option2, option3, ep_price, stock, visible, sort_order)`,
        { count: "exact" }
      )
      .eq("visible", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
    }

    type Variant = {
      id: string;
      title: string;
      option1: string | null;
      option2: string | null;
      option3: string | null;
      ep_price: number;
      stock: number | null;
      visible: boolean;
      sort_order: number;
    };
    type Vendor = {
      id: string;
      name: string;
      handle: string;
      tagline: string | null;
      logo_url: string | null;
      website_url: string | null;
    };
    type Product = {
      id: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      category: string | null;
      image_urls: string[];
      visible: boolean;
      sort_order: number;
      // Supabase returns joined 1:1 FKs as arrays; normalise below.
      vendor: Vendor | Vendor[] | null;
      variants: Variant[] | null;
    };

    const items = ((data ?? []) as Product[])
      .map((p) => {
        // Filter variants to visible + in-stock (null stock = unlimited)
        const visibleVariants = (p.variants ?? [])
          .filter((v) => v.visible && (v.stock == null || v.stock > 0))
          .sort((a, b) => a.sort_order - b.sort_order);
        if (visibleVariants.length === 0) return null;
        const fromPrice = visibleVariants.reduce(
          (min, v) => (v.ep_price < min ? v.ep_price : min),
          visibleVariants[0].ep_price
        );
        const vendor = Array.isArray(p.vendor) ? p.vendor[0] ?? null : p.vendor;
        return {
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          description: p.description,
          category: p.category,
          image_urls: p.image_urls ?? [],
          from_ep_price: fromPrice,
          vendor: vendor
            ? {
                id: vendor.id,
                name: vendor.name,
                handle: vendor.handle,
                tagline: vendor.tagline,
                logo_url: vendor.logo_url,
                website_url: vendor.website_url,
              }
            : null,
          variants: visibleVariants.map((v) => ({
            id: v.id,
            title: v.title,
            option1: v.option1,
            option2: v.option2,
            option3: v.option3,
            ep_price: v.ep_price,
            stock: v.stock,
          })),
          visible: p.visible,
          sort_order: p.sort_order,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const total = count ?? items.length;
    return NextResponse.json({
      data: items,
      total,
      limit,
      offset,
      has_more: offset + items.length < total,
      supplier: getIntegrationStatus(),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/market/products] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
