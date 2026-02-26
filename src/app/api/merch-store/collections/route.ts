import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import type { MerchCollectionItem } from "@/types/merch-store";

/**
 * GET /api/merch-store/collections — List collections
 *
 * Public: returns only active collections with event + items (product joined).
 * Admin (with ?all=true): returns all collections regardless of status.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const showAll = request.nextUrl.searchParams.get("all") === "true";

    let query = supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .select(`
        *,
        event:events!merch_collections_event_id_fkey(
          id, slug, name, date_start, venue_name, city, cover_image, hero_image, status
        ),
        items:merch_collection_items(
          *,
          product:products(*)
        )
      `)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (!showAll) {
      query = query.eq("status", "active");
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort items within each collection by sort_order
    const collections = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      items: ((c.items as MerchCollectionItem[]) || []).sort(
        (a: MerchCollectionItem, b: MerchCollectionItem) => a.sort_order - b.sort_order
      ),
    }));

    return NextResponse.json({ data: collections });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/merch-store/collections — Create a new collection (admin)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      event_id,
      slug,
      title,
      description,
      status = "draft",
      is_limited_edition = false,
      limited_edition_label,
      hero_image,
      tile_image,
      custom_cta_text,
      pickup_instructions,
      items = [],
    } = body;

    if (!event_id || !slug || !title) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, slug, title" },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) {
      return NextResponse.json(
        { error: "Slug must be lowercase alphanumeric with hyphens (e.g., summer-festival-merch)" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Verify event belongs to this org
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id")
      .eq("id", event_id)
      .eq("org_id", orgId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Create the collection
    const { data: collection, error: collectionError } = await supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .insert({
        org_id: orgId,
        event_id,
        slug,
        title,
        description: description || null,
        status,
        is_limited_edition,
        limited_edition_label: limited_edition_label || null,
        hero_image: hero_image || null,
        tile_image: tile_image || null,
        custom_cta_text: custom_cta_text || "Pre-order Now",
        pickup_instructions: pickup_instructions || "Collect at the merch stand when you arrive at the event",
      })
      .select()
      .single();

    if (collectionError) {
      if (collectionError.code === "23505") {
        return NextResponse.json(
          { error: "A collection with this slug already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: collectionError.message }, { status: 500 });
    }

    // Insert items if provided
    if (items.length > 0) {
      const itemRows = items.map(
        (
          item: {
            product_id: string;
            sort_order?: number;
            is_featured?: boolean;
            is_limited_edition?: boolean;
            limited_edition_label?: string;
            custom_price?: number;
            max_per_order?: number;
          },
          index: number
        ) => ({
          org_id: orgId,
          collection_id: collection.id,
          product_id: item.product_id,
          sort_order: item.sort_order ?? index,
          is_featured: item.is_featured ?? false,
          is_limited_edition: item.is_limited_edition ?? false,
          limited_edition_label: item.limited_edition_label || null,
          custom_price: item.custom_price ?? null,
          max_per_order: item.max_per_order ?? null,
        })
      );

      const { error: itemsError } = await supabase
        .from(TABLES.MERCH_COLLECTION_ITEMS)
        .insert(itemRows);

      if (itemsError) {
        // Clean up collection if items failed
        await supabase
          .from(TABLES.MERCH_COLLECTIONS)
          .delete()
          .eq("id", collection.id);
        return NextResponse.json({ error: `Failed to add items: ${itemsError.message}` }, { status: 500 });
      }
    }

    // Fetch the full collection with items + products
    const { data: fullCollection } = await supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .select(`
        *,
        event:events!merch_collections_event_id_fkey(
          id, slug, name, date_start, venue_name, city, cover_image, hero_image, status
        ),
        items:merch_collection_items(
          *,
          product:products(*)
        )
      `)
      .eq("id", collection.id)
      .single();

    return NextResponse.json({ data: fullCollection }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
