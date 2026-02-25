import type { Metadata } from "next";
import { MidnightEventPage } from "@/components/midnight/MidnightEventPage";
import { MidnightExternalPage } from "@/components/midnight/MidnightExternalPage";
import { AuraEventPage } from "@/components/aura/AuraEventPage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveTemplate } from "@/lib/themes";
import { TABLES, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import {
  generateEventSeo,
  resolveEventSeoTitle,
  resolveEventSeoDescription,
  buildEventJsonLd,
} from "@/lib/seo";
import type { BrandingSettings } from "@/types/settings";

/** Force dynamic rendering — every request fetches fresh data from Supabase.
 *  This ensures admin changes (lineup, images, theme, etc.) appear immediately
 *  without needing to refresh multiple times or wait for ISR revalidation. */
export const dynamic = "force-dynamic";

/** Fetch event from DB (for admin-editable content). */
async function getEventFromDB(slug: string, orgId: string) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return null;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*)), event_artists(*, artist:artists(*))")
      .eq("slug", slug)
      .eq("org_id", orgId)
      .single();

    return data || null;
  } catch {
    return null;
  }
}

/** Fetch branding for an org */
async function fetchBranding(orgId: string): Promise<{ orgName: string; faviconUrl?: string; twitterHandle?: string }> {
  let orgName = "Entry";
  let faviconUrl: string | undefined;
  let twitterHandle: string | undefined;
  try {
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
        if (branding.favicon_url) faviconUrl = branding.favicon_url;
        if (branding.social_links?.twitter) twitterHandle = branding.social_links.twitter;
      }
    }
  } catch { /* Fall through with defaults */ }
  return { orgName, faviconUrl, twitterHandle };
}

/** Resolve the canonical base URL for the current org */
async function getBaseUrl(orgId: string): Promise<string> {
  // Try to find the primary domain for this org
  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.DOMAINS)
        .select("hostname")
        .eq("org_id", orgId)
        .eq("is_primary", true)
        .single();
      if (data?.hostname) {
        return `https://${data.hostname}`;
      }
    }
  } catch { /* Fall through */ }
  return process.env.NEXT_PUBLIC_SITE_URL || "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const orgId = await getOrgId();

  const event = await getEventFromDB(slug, orgId);
  if (event) {
    const [{ orgName, faviconUrl, twitterHandle }, baseUrl] = await Promise.all([
      fetchBranding(orgId),
      getBaseUrl(orgId),
    ]);

    // Extract artist names from joined data or lineup array
    const artistNames = event.event_artists?.length
      ? event.event_artists
          .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
          .map((ea: { artist?: { name?: string } }) => ea.artist?.name)
          .filter(Boolean) as string[]
      : event.lineup?.filter(Boolean) || [];

    // Auto-generate optimized SEO metadata
    const auto = generateEventSeo({ event, orgName, artistNames });

    // Use manual overrides if set, otherwise auto-generated
    const title = resolveEventSeoTitle(event, auto.title);
    const description = resolveEventSeoDescription(event, auto.description);
    const canonicalUrl = baseUrl ? `${baseUrl}/event/${slug}` : undefined;
    const ogImage = event.hero_image || event.cover_image;

    return {
      title,
      description,
      keywords: auto.keywords,
      ...(faviconUrl ? { icons: { icon: faviconUrl, apple: faviconUrl } } : {}),
      ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
      openGraph: {
        type: "website",
        title,
        description,
        ...(canonicalUrl ? { url: canonicalUrl } : {}),
        ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: event.name }] } : {}),
        siteName: orgName,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(ogImage ? { images: [{ url: ogImage, alt: event.name }] } : {}),
        ...(twitterHandle ? { creator: twitterHandle.startsWith("@") ? twitterHandle : `@${twitterHandle}` } : {}),
      },
      robots: {
        index: event.status === "live" && event.visibility === "public",
        follow: true,
      },
    };
  }

  return { title: "Event", robots: { index: false, follow: false } };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const orgId = await getOrgId();

  // In editor preview mode, the ?template= param tells us which theme to render.
  // This lets the admin preview non-active themes (e.g. editing Aura while Midnight is live).
  const editorTemplate = sp.editor === "1" && typeof sp.template === "string"
    ? sp.template
    : undefined;

  // Fetch event + active template + branding in parallel
  const [event, activeTemplate, { orgName }, baseUrl] = await Promise.all([
    getEventFromDB(slug, orgId),
    getActiveTemplate(orgId),
    fetchBranding(orgId),
    getBaseUrl(orgId),
  ]);

  if (!event) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        <p>Event not found.</p>
      </div>
    );
  }

  // Extract artist names for JSON-LD
  const artistNames = event.event_artists?.length
    ? event.event_artists
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((ea: { artist?: { name?: string } }) => ea.artist?.name)
        .filter(Boolean) as string[]
    : event.lineup?.filter(Boolean) || [];

  // JSON-LD structured data for Google rich results
  const jsonLd = buildEventJsonLd({
    event,
    orgName,
    siteUrl: baseUrl,
    artistNames,
  });

  const structuredData = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );

  // External ticketing — simplified page with CTA linking out
  if (event.payment_method === "external") {
    return (
      <>
        {structuredData}
        <MidnightExternalPage event={event} />
      </>
    );
  }

  // Use editor override if present, otherwise use live active template
  const template = editorTemplate || activeTemplate;

  // Aura theme: render Aura component tree (shadcn/ui based)
  if (template === "aura") {
    return (
      <>
        {structuredData}
        <AuraEventPage event={event} />
      </>
    );
  }
  return (
    <>
      {structuredData}
      <MidnightEventPage event={event} />
    </>
  );
}
