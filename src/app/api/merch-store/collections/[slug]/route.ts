import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import type { MerchCollectionItem } from "@/types/merch-store";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/merch-store/collections/[slug] — Get a single collection with items + products
 * Public: only returns active collections.
 * Admin (with ?admin=true): returns any status.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const isAdmin = request.nextUrl.searchParams.get("admin") === "true";

    let query = supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .select(`
        *,
        event:events!merch_collections_event_id_fkey(
          id, slug, name, date_start, date_end, venue_name, venue_address,
          city, country, cover_image, hero_image, status, currency,
          doors_time, about_text, tag_line
        ),
        items:merch_collection_items(
          *,
          product:products(*)
        )
      `)
      .eq("org_id", orgId)
      .eq("slug", slug);

    if (!isAdmin) {
      query = query.eq("status", "active");
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Sort items by sort_order
    const collection = {
      ...data,
      items: ((data.items as MerchCollectionItem[]) || []).sort(
        (a: MerchCollectionItem, b: MerchCollectionItem) => a.sort_order - b.sort_order
      ),
    };

    return NextResponse.json({ data: collection });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/merch-store/collections/[slug] — Update a collection (admin)
 * Accepts partial updates. If `items` array is provided, replaces all items.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { slug } = await context.params;
    const body = await request.json();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Find existing collection
    const { data: existing } = await supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Build update payload (only included fields)
    const updateFields: Record<string, unknown> = {};
    const allowedFields = [
      "title", "description", "status", "is_limited_edition",
      "limited_edition_label", "hero_image", "tile_image", "custom_cta_text",
      "pickup_instructions", "sort_order", "slug", "event_id",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateFields[field] = body[field];
      }
    }

    // Validate new slug if changing
    if (updateFields.slug && updateFields.slug !== slug) {
      const newSlug = updateFields.slug as string;
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(newSlug) && newSlug.length > 1) {
        return NextResponse.json(
          { error: "Slug must be lowercase alphanumeric with hyphens" },
          { status: 400 }
        );
      }
    }

    // Validate new event_id if changing
    if (updateFields.event_id) {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("id")
        .eq("id", updateFields.event_id)
        .eq("org_id", orgId)
        .single();

      if (!event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
    }

    // Update collection fields
    if (Object.keys(updateFields).length > 0) {
      const { error: updateError } = await supabase
        .from(TABLES.MERCH_COLLECTIONS)
        .update(updateFields)
        .eq("id", existing.id);

      if (updateError) {
        if (updateError.code === "23505") {
          return NextResponse.json(
            { error: "A collection with this slug already exists" },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    // Replace items if provided
    if ("items" in body && Array.isArray(body.items)) {
      // Delete existing items
      await supabase
        .from(TABLES.MERCH_COLLECTION_ITEMS)
        .delete()
        .eq("collection_id", existing.id);

      // Insert new items
      if (body.items.length > 0) {
        const itemRows = body.items.map(
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
            collection_id: existing.id,
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
          return NextResponse.json({ error: `Failed to update items: ${itemsError.message}` }, { status: 500 });
        }
      }
    }

    // Return full updated collection
    const finalSlug = (updateFields.slug as string) || slug;
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
      .eq("id", existing.id)
      .single();

    return NextResponse.json({ data: fullCollection });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/merch-store/collections/[slug] — Delete a collection (admin)
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { slug } = await context.params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: existing } = await supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Items cascade-delete with the collection
    const { error } = await supabase
      .from(TABLES.MERCH_COLLECTIONS)
      .delete()
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
