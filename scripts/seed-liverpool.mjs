/**
 * Build-time seed: Creates the Liverpool event record in the database so it
 * can be managed via the admin event editor. Runs automatically during
 * `npm run build`.
 *
 * Idempotent — safe to run on every deploy. Skips if the event already exists.
 *
 * NOTE: This only creates the event record (content, images, lineup, etc.).
 * WeeZTix ticket IDs are managed in site_settings, not in ticket_types.
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

  // Check if event already exists
  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("slug", SLUG)
    .eq("org_id", ORG_ID)
    .single();

  if (existing) {
    console.log("[seed] Liverpool event already exists — skipping");
    return;
  }

  // Create the event record (content only — WeeZTix manages tickets via site_settings)
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

  console.log("[seed] Created Liverpool event:", event.id);
}

seed().catch((err) => {
  // Don't block the build if Supabase is unreachable (e.g. local dev, CI without env vars)
  console.warn(
    "[seed] Could not run seed — continuing build:",
    err.message || err
  );
});
