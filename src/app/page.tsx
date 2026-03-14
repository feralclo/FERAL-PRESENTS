import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, homepageKey, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { buildOrganizationJsonLd } from "@/lib/seo";
import { getCanonicalBaseUrl } from "@/lib/seo-server";
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
  const orgId = await getOrgId();
  let orgName = "Entry";
  let faviconUrl: string | undefined;
  let twitterHandle: string | undefined;
  let heroImageUrl: string | undefined;
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const [brandingResult, homepageResult, resolvedBaseUrl] = await Promise.all([
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
        getCanonicalBaseUrl(orgId),
      ]);
      if (resolvedBaseUrl) baseUrl = resolvedBaseUrl;
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
  const canonicalUrl = baseUrl ? `${baseUrl}/` : undefined;

  return {
    title,
    description,
    ...(faviconUrl ? { icons: { icon: faviconUrl, apple: faviconUrl } } : {}),
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    openGraph: {
      type: "website",
      title,
      description,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const orgId = await getOrgId();
  const baseUrl = await getCanonicalBaseUrl(orgId);
  let events: LandingEvent[] = [];
  let heroSettings: HomepageSettings = DEFAULT_HERO;
  let aboutSection: BrandingSettings["about_section"] | undefined;
  let branding: BrandingSettings | null = null;

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      // Fetch events, homepage settings, and branding in parallel
      const [eventsResult, settingsResult, brandingResult] = await Promise.all([
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
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single(),
      ]);

      if (eventsResult.data) events = eventsResult.data as LandingEvent[];
      if (settingsResult.data?.data) {
        heroSettings = { ...DEFAULT_HERO, ...settingsResult.data.data as HomepageSettings };
      }
      if (brandingResult.data?.data) {
        branding = brandingResult.data.data as BrandingSettings;
        aboutSection = branding.about_section;
      }
    }
  } catch {
    // Fall through with defaults
  }

  // ?ref=CODE auto-applies a rep's discount code (persists in sessionStorage)
  const refCode = typeof sp.ref === "string" ? sp.ref : undefined;
  const refScript = refCode ? (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{sessionStorage.setItem("feral_popup_discount",${JSON.stringify(refCode)})}catch(e){}`,
      }}
    />
  ) : null;

  // Organization JSON-LD — establishes brand identity in search results
  const orgJsonLd = buildOrganizationJsonLd({
    orgName: branding?.org_name || "Entry",
    siteUrl: baseUrl,
    logoUrl: branding?.logo_url,
    description: `Discover upcoming events and buy tickets from ${branding?.org_name || "Entry"}.`,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      {refScript}
      <LandingPage events={events} heroSettings={heroSettings} orgId={orgId} aboutSection={aboutSection} branding={branding} />
    </>
  );
}
