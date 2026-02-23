import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, homepageKey, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import type { LandingEvent } from "@/types/events";
import type { HomepageSettings } from "@/types/settings";
import type { BrandingSettings } from "@/types/settings";

/** Admin changes (new events, status updates) must appear immediately */
export const dynamic = "force-dynamic";

const DEFAULT_HERO: HomepageSettings = {
  hero_title_line1: "UPCOMING",
  hero_title_line2: "EVENTS",
  hero_cta_text: "SEE EVENTS",
  hero_image_url: "",
  hero_focal_x: 50,
  hero_focal_y: 50,
};

/** Dynamic metadata — reads org branding so each tenant gets their own title/OG */
export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  let orgName = "Entry";
  let description = "Events, tickets, and experiences.";

  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();
      if (data?.data) {
        const branding = data.data as BrandingSettings;
        if (branding.org_name) orgName = branding.org_name;
      }
    }
  } catch {
    // Fall through with defaults
  }

  const title = `${orgName} — Events & Tickets`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      ...(siteUrl ? { url: siteUrl } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

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
