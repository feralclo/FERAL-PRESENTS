import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getIntegrationStatus } from "@/lib/market/shopify";
import { parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/market/products
 *
 * Curated platform-level marketplace. All tenants' reps see the same
 * listings — this is Entry editorial picks, NOT per-tenant inventory.
 *
 * Response:
 *   {
 *     data: [{ id, title, subtitle, description, category, image_urls,
 *              ep_price, stock, visible, sort_order }],
 *     total, limit, offset, has_more,
 *     supplier: { mode: 'stub' | 'live', reason? }
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
        "id, title, subtitle, description, category, image_urls, ep_price, stock, visible, sort_order, created_at",
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

    type Product = {
      id: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      category: string | null;
      image_urls: string[];
      ep_price: number;
      stock: number | null;
      visible: boolean;
      sort_order: number;
    };

    const items = ((data ?? []) as Product[]).map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
      category: p.category,
      image_urls: p.image_urls ?? [],
      ep_price: p.ep_price,
      stock: p.stock,
      visible: p.visible,
      sort_order: p.sort_order,
    }));

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
