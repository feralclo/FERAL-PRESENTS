import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SETTINGS_KEYS } from "@/lib/constants";

/**
 * One-time migration: Creates the Liverpool event in the events + ticket_types
 * tables so it can be managed via the admin event editor. Preserves the existing
 * WeeZTix configuration in site_settings. Safe to call multiple times — skips
 * if the event already exists.
 *
 * Usage: POST /api/migrate/liverpool
 */
export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const SLUG = "liverpool-27-march";

    // Check if event already exists
    const { data: existing } = await supabase
      .from(TABLES.EVENTS)
      .select("id")
      .eq("slug", SLUG)
      .eq("org_id", ORG_ID)
      .single();

    if (existing) {
      return NextResponse.json({
        message: "Liverpool event already exists in the database",
        event_id: existing.id,
        skipped: true,
      });
    }

    // Create the event
    const { data: event, error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .insert({
        org_id: ORG_ID,
        slug: SLUG,
        name: "FERAL Liverpool",
        description:
          "FERAL takes over Invisible Wind Factory Liverpool on 27 March 2026. Hard techno, industrial and hardstyle. Full 360° setup with immersive production.",
        venue_name: "Invisible Wind Factory",
        venue_address: "3 Regent Rd",
        city: "Liverpool",
        country: "UK",
        date_start: "2026-03-27T21:30:00.000Z",
        date_end: "2026-03-28T04:00:00.000Z",
        doors_open: "2026-03-27T21:30:00.000Z",
        age_restriction: "18+",
        status: "live",
        visibility: "public",
        payment_method: "weeztix",
        currency: "GBP",
        theme: "default",
        settings_key: SETTINGS_KEYS.LIVERPOOL,
        about_text:
          "FERAL takes over Invisible Wind Factory on 27 March with a full 360° setup and the most immersive production build the venue has ever seen. A stacked lineup built as a journey — hard bounce into hard techno, descending into industrial, before finally erupting in hardstyle and rawstyle.",
        lineup: [
          "DARK MATTER",
          "MIKA HEGGEMAN",
          "NICOLAS JULIAN",
          "SANDY KLETZ",
          "SO JUICE",
          "STEVIE",
        ],
        details_text:
          "This is an 18+ event. Valid photo ID required at the door. No re-entry. The venue operates a zero-tolerance policy. Accessibility info available on request.",
        tag_line: "SECOND RELEASE NOW ACTIVE",
        doors_time: "9:30PM — 4:00AM",
        hero_image: "/images/liverpool-event-banner.jpg",
        cover_image: "/images/liverpool-tile.jpg",
      })
      .select()
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Failed to create event", detail: eventError?.message },
        { status: 500 }
      );
    }

    // Create ticket types
    const ticketTypes = [
      {
        org_id: ORG_ID,
        event_id: event.id,
        name: "General Release",
        description: "Standard entry",
        price: 26.46,
        capacity: null,
        sold: 0,
        sort_order: 0,
        status: "active",
        includes_merch: false,
        min_per_order: 1,
        max_per_order: 10,
        tier: "standard",
      },
      {
        org_id: ORG_ID,
        event_id: event.id,
        name: "VIP Ticket",
        description: "VIP entry + perks",
        price: 35,
        capacity: null,
        sold: 0,
        sort_order: 1,
        status: "active",
        includes_merch: false,
        min_per_order: 1,
        max_per_order: 10,
        tier: "platinum",
      },
      {
        org_id: ORG_ID,
        event_id: event.id,
        name: "VIP Ticket + T-Shirt",
        description: "VIP entry + exclusive event tee",
        price: 65,
        capacity: null,
        sold: 0,
        sort_order: 2,
        status: "active",
        includes_merch: true,
        merch_type: "T-Shirt",
        merch_sizes: ["XS", "S", "M", "L", "XL", "XXL"],
        min_per_order: 1,
        max_per_order: 10,
        tier: "black",
      },
    ];

    const { data: createdTypes, error: typesError } = await supabase
      .from(TABLES.TICKET_TYPES)
      .insert(ticketTypes)
      .select();

    if (typesError) {
      return NextResponse.json(
        { error: "Event created but ticket types failed", detail: typesError.message },
        { status: 500 }
      );
    }

    // Update settings with ticket group configuration
    // VIP + VIP+Tee go in "VIP Experiences" group, General stays ungrouped
    const vipId = createdTypes?.find((t) => t.name === "VIP Ticket")?.id;
    const vipTeeId = createdTypes?.find((t) => t.name === "VIP Ticket + T-Shirt")?.id;

    const groupMap: Record<string, string | null> = {};
    if (vipId) groupMap[vipId] = "VIP Experiences";
    if (vipTeeId) groupMap[vipTeeId] = "VIP Experiences";

    // Merge ticket groups into existing Liverpool settings (preserve WeeZTix IDs etc.)
    const { data: existingSettings } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", SETTINGS_KEYS.LIVERPOOL)
      .single();

    const mergedSettings = {
      ...(existingSettings?.data || {}),
      ticket_groups: ["VIP Experiences"],
      ticket_group_map: groupMap,
    };

    await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: SETTINGS_KEYS.LIVERPOOL,
        data: mergedSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return NextResponse.json({
      message: "Liverpool event migrated successfully",
      event_id: event.id,
      ticket_types: createdTypes?.length || 0,
      groups: ["VIP Experiences"],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Migration failed", detail: String(err) },
      { status: 500 }
    );
  }
}
