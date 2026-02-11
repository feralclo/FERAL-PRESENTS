/**
 * Build-time seed: Creates the Liverpool event in the database so it can be
 * managed via the admin event editor. Runs automatically during `npm run build`.
 *
 * Idempotent — safe to run on every deploy. Skips if the event already has
 * ticket_types (migration already complete).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://rqtfghzhkkdytkegcifm.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdGZnaHpoa2tkeXRrZWdjaWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTUwMTUsImV4cCI6MjA4NTY5MTAxNX0.8IVDc92EYAq4FhTqVy0k5ur79zD9XofBBFjAuctKOUc";

const ORG_ID = "feral";
const SLUG = "liverpool-27-march";
const SETTINGS_KEY = "feral_event_liverpool";

async function seed() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Check if event already has ticket_types (migration complete)
  const { data: existing } = await supabase
    .from("events")
    .select("id, ticket_types(id)")
    .eq("slug", SLUG)
    .eq("org_id", ORG_ID)
    .single();

  if (existing?.ticket_types?.length > 0) {
    console.log("[seed] Liverpool already migrated — skipping");
    return;
  }

  // If event exists but has no ticket_types, we need to add them
  let eventId = existing?.id;

  if (!eventId) {
    // Create the event
    const { data: event, error: eventError } = await supabase
      .from("events")
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
        settings_key: SETTINGS_KEY,
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
      .select("id")
      .single();

    if (eventError || !event) {
      console.warn("[seed] Failed to create event:", eventError?.message);
      return;
    }
    eventId = event.id;
    console.log("[seed] Created Liverpool event:", eventId);
  } else {
    console.log("[seed] Liverpool event exists, adding ticket_types:", eventId);
  }

  // Create ticket types
  const { data: createdTypes, error: typesError } = await supabase
    .from("ticket_types")
    .insert([
      {
        org_id: ORG_ID,
        event_id: eventId,
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
        event_id: eventId,
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
        event_id: eventId,
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
    ])
    .select();

  if (typesError) {
    console.warn("[seed] Failed to create ticket types:", typesError.message);
    return;
  }

  console.log("[seed] Created", createdTypes.length, "ticket types");

  // Set up ticket groups in settings (VIP + VIP+Tee → "VIP Experiences")
  const vipId = createdTypes.find((t) => t.name === "VIP Ticket")?.id;
  const vipTeeId = createdTypes.find(
    (t) => t.name === "VIP Ticket + T-Shirt"
  )?.id;

  const groupMap = {};
  if (vipId) groupMap[vipId] = "VIP Experiences";
  if (vipTeeId) groupMap[vipTeeId] = "VIP Experiences";

  // Merge into existing settings (preserve WeeZTix IDs, theme config, etc.)
  const { data: existingSettings } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", SETTINGS_KEY)
    .single();

  const mergedSettings = {
    ...(existingSettings?.data || {}),
    ticket_groups: ["VIP Experiences"],
    ticket_group_map: groupMap,
  };

  await supabase.from("site_settings").upsert(
    {
      key: SETTINGS_KEY,
      data: mergedSettings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  console.log("[seed] Liverpool migration complete");
}

seed().catch((err) => {
  // Don't block the build if Supabase is unreachable (e.g. local dev, CI without env vars)
  console.warn("[seed] Could not run seed — continuing build:", err.message || err);
});
