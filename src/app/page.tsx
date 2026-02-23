import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, homepageKey, SETTINGS_KEYS } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import type { LandingEvent } from "@/types/events";
import type { HomepageSettings } from "@/types/settings";

/** Admin changes (new events, status updates) must appear immediately */
export const dynamic = "force-dynamic";

const DEFAULT_HERO: HomepageSettings = {
  hero_title_line1: "BORN ON THE",
  hero_title_line2: "DANCE FLOOR",
  hero_cta_text: "SEE EVENTS",
  hero_image_url: "/images/banner-1.jpg",
  hero_focal_x: 50,
  hero_focal_y: 50,
};

export const metadata: Metadata = {
  title: "FERAL PRESENTS — Underground Techno & Rave Events UK",
  description:
    "FERAL PRESENTS is an underground events collective pushing the boundaries of techno, rave and electronic music. Raw, unfiltered experiences across the UK and Europe.",
  openGraph: {
    type: "website",
    title: "FERAL PRESENTS — Underground Techno & Rave Events",
    description:
      "Underground events collective pushing the boundaries of techno, rave and electronic music. Raw, unfiltered experiences.",
    images: [{ url: "https://feralpresents.com/images/banner-1.jpg" }],
    url: "https://feralpresents.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: "FERAL PRESENTS — Underground Techno & Rave Events",
    description:
      "Underground events collective pushing the boundaries of techno, rave and electronic music.",
    images: ["https://feralpresents.com/images/banner-1.jpg"],
  },
  keywords: [
    "techno events",
    "rave",
    "underground music",
    "electronic music",
    "UK events",
    "warehouse rave",
    "hard techno",
    "industrial techno",
  ],
};

export default async function HomePage() {
  const orgId = await getOrgId();
  let events: LandingEvent[] = [];
  let heroSettings: HomepageSettings = DEFAULT_HERO;

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      // Fetch events and homepage settings in parallel
      const [eventsResult, settingsResult] = await Promise.all([
        supabase
          .from(TABLES.EVENTS)
          .select(
            "id, slug, name, date_start, venue_name, city, cover_image, tag_line, doors_time, payment_method, external_link"
          )
          .eq("org_id", orgId)
          .eq("status", "live")
          .eq("visibility", "public")
          .order("date_start", { ascending: true }),
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", homepageKey(orgId))
          .single(),
      ]);

      if (eventsResult.data) events = eventsResult.data as LandingEvent[];
      if (settingsResult.data?.data) {
        heroSettings = { ...DEFAULT_HERO, ...settingsResult.data.data as HomepageSettings };
      }
    }
  } catch {
    // Fall through with defaults
  }

  return <LandingPage events={events} heroSettings={heroSettings} />;
}
