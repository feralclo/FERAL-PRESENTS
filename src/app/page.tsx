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
  let faviconUrl: string | undefined;
  let twitterHandle: string | undefined;
  let heroImageUrl: string | undefined;

  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const [brandingResult, homepageResult] = await Promise.all([
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single(),
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", homepageKey(orgId))
          .single(),
      ]);
      if (brandingResult.data?.data) {
        const branding = brandingResult.data.data as BrandingSettings;
        if (branding.org_name) orgName = branding.org_name;
        if (branding.favicon_url) faviconUrl = branding.favicon_url;
        if (branding.social_links?.twitter) twitterHandle = branding.social_links.twitter;
      }
      if (homepageResult.data?.data) {
        const homepage = homepageResult.data.data as HomepageSettings;
        if (homepage.hero_image_url) heroImageUrl = homepage.hero_image_url;
      }
    }
  } catch {
    // Fall through with defaults
  }

  const title = `${orgName} — Events & Tickets`;
  const description = `Discover upcoming events and buy tickets from ${orgName}. Live music, experiences, and more.`;

  return {
    title,
    description,
    ...(faviconUrl ? { icons: { icon: faviconUrl, apple: faviconUrl } } : {}),
    openGraph: {
      type: "website",
      title,
      description,
      ...(siteUrl ? { url: siteUrl } : {}),
      ...(heroImageUrl ? { images: [{ url: heroImageUrl, width: 1200, height: 630, alt: orgName }] } : {}),
      siteName: orgName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(heroImageUrl ? { images: [{ url: heroImageUrl, alt: orgName }] } : {}),
      ...(twitterHandle ? { creator: twitterHandle.startsWith("@") ? twitterHandle : `@${twitterHandle}` } : {}),
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
