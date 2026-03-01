import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import { getOrgBaseCurrency } from "@/lib/org-settings";

/**
 * GET /api/events — List all events for the org
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
      .eq("org_id", orgId)
      .order("date_start", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/events — Create a new event
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      name,
      slug,
      description,
      venue_name,
      venue_address,
      city,
      country,
      date_start,
      date_end,
      doors_open,
      age_restriction,
      status = "draft",
      visibility = "public",
      payment_method = "stripe",
      capacity,
      cover_image,
      hero_image,
      theme,
      currency,
      about_text,
      lineup,
      details_text,
      tag_line,
      doors_time,
      stripe_account_id,
      platform_fee_percent,
      external_link,
      seo_title,
      seo_description,
      ticket_types,
    } = body;

    if (!name || !slug || !date_start) {
      return NextResponse.json(
        { error: "Missing required fields: name, slug, date_start" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Default currency to org's base currency if not provided
    const eventCurrency = currency || (await getOrgBaseCurrency(orgId));

    // Create event
    const { data: event, error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .insert({
        org_id: orgId,
        name,
        slug,
        description,
        venue_name,
        venue_address,
        city,
        country,
        date_start,
        date_end,
        doors_open,
        age_restriction,
        status,
        visibility,
        payment_method,
        capacity,
        cover_image,
        hero_image,
        theme,
        currency: eventCurrency,
        about_text,
        lineup,
        details_text,
        tag_line,
        doors_time,
        stripe_account_id,
        platform_fee_percent,
        external_link,
        seo_title: seo_title || null,
        seo_description: seo_description || null,
      })
      .select()
      .single();

    if (eventError) {
      return NextResponse.json(
        { error: eventError.message },
        { status: 500 }
      );
    }

    // Create ticket types if provided
    if (ticket_types && Array.isArray(ticket_types) && ticket_types.length > 0) {
      const ticketRows = ticket_types.map(
        (
          tt: {
            name: string;
            description?: string;
            price: number;
            capacity?: number;
            includes_merch?: boolean;
            merch_type?: string;
            merch_sizes?: string[];
            merch_name?: string;
            merch_description?: string;
            merch_images?: string[] | Record<string, string>;
            sort_order?: number;
            min_per_order?: number;
            max_per_order?: number;
            tier?: string;
            product_id?: string;
          },
          i: number
        ) => ({
          org_id: orgId,
          event_id: event.id,
          name: tt.name,
          description: tt.description,
          price: tt.price,
          capacity: tt.capacity,
          includes_merch: tt.includes_merch || false,
          merch_type: tt.merch_type,
          merch_sizes: tt.merch_sizes,
          merch_name: tt.merch_name,
          merch_description: tt.merch_description,
          merch_images: tt.merch_images,
          sort_order: tt.sort_order ?? i,
          min_per_order: tt.min_per_order ?? 1,
          max_per_order: tt.max_per_order ?? 10,
          tier: tt.tier || "standard",
          product_id: tt.product_id,
        })
      );

      const { error: ttError } = await supabase
        .from(TABLES.TICKET_TYPES)
        .insert(ticketRows);

      if (ttError) {
        return NextResponse.json(
          { error: `Event created but ticket types failed: ${ttError.message}` },
          { status: 500 }
        );
      }
    }

    // Return event with ticket types
    const { data: fullEvent } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*)")
      .eq("id", event.id)
      .eq("org_id", orgId)
      .single();

    return NextResponse.json({ data: fullEvent }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
