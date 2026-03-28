import { getOrgId } from "@/lib/org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey, homepageKey } from "@/lib/constants";
import { getCanonicalBaseUrl } from "@/lib/seo-server";
import { buildEventsListJsonLd } from "@/lib/seo";
import type { Metadata } from "next";
import type { BrandingSettings, HomepageSettings } from "@/types/settings";
import type { ListingEvent } from "@/types/events";
import { EventsListPage } from "@/components/events/EventsListPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  let orgName = "Entry";
  let faviconUrl: string | undefined;
  let twitterHandle: string | undefined;
  let heroImageUrl: string | undefined;
  let baseUrl = "";

  if (supabase) {
    try {
      const [brandingRes, homepageRes, resolvedBaseUrl] = await Promise.all([
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
      baseUrl = resolvedBaseUrl;
      const branding = brandingRes.data?.data as BrandingSettings | undefined;
      if (branding?.org_name) orgName = branding.org_name;
      if (branding?.favicon_url) faviconUrl = branding.favicon_url;
      if (branding?.social_links?.twitter) twitterHandle = branding.social_links.twitter;

      // Share image: homepage og_image > homepage hero > logo (last resort)
      const homepage = homepageRes.data?.data as HomepageSettings | undefined;
      heroImageUrl = homepage?.og_image_url || homepage?.hero_image_url || branding?.logo_url;
    } catch {
      // Use default
    }
  }

  const title = `Upcoming Events & Tickets | ${orgName}`;
  const description = `Browse upcoming events and buy tickets from ${orgName}. Live music, club nights, and immersive experiences. Secure your spot now.`;
  const canonicalUrl = baseUrl ? `${baseUrl}/events/` : undefined;

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
    robots: { index: true, follow: true },
  };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();

  let events: ListingEvent[] = [];
  let branding: BrandingSettings | null = null;

  if (supabase) {
    try {
      // Fetch events, ticket types, and branding in parallel
      const [eventsResult, ticketTypesResult, brandingResult] = await Promise.all([
        supabase
          .from(TABLES.EVENTS)
          .select(
            "id, slug, name, date_start, date_end, venue_name, city, cover_image, hero_image, tag_line, doors_time, payment_method, external_link, about_text, age_restriction, currency"
          )
          .eq("org_id", orgId)
          .eq("status", "live")
          .eq("visibility", "public")
          .or(`date_end.gte.${new Date().toISOString()},date_end.is.null`)
          .order("date_start", { ascending: true }),
        supabase
          .from(TABLES.TICKET_TYPES)
          .select("event_id, price, capacity, sold, status")
          .eq("org_id", orgId)
          .eq("status", "active"),
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single(),
      ]);

      if (brandingResult.data?.data) {
        branding = brandingResult.data.data as BrandingSettings;
      }

      if (eventsResult.data) {
        // Build ticket stats per event
        const ticketsByEvent = new Map<string, Array<{ price: number; capacity?: number; sold: number }>>();
        if (ticketTypesResult.data) {
          for (const tt of ticketTypesResult.data) {
            const arr = ticketsByEvent.get(tt.event_id) || [];
            arr.push({ price: tt.price, capacity: tt.capacity, sold: tt.sold });
            ticketsByEvent.set(tt.event_id, arr);
          }
        }

        events = eventsResult.data.map((event) => {
          const tickets = ticketsByEvent.get(event.id) || [];

          // Compute min_price from active tickets
          const prices = tickets.map((t) => t.price).filter((p) => p > 0);
          const min_price = prices.length > 0 ? Math.min(...prices) : undefined;

          // Compute status_label
          let status_label: string | null = null;
          if (tickets.length > 0) {
            const totalCapacity = tickets.reduce((sum, t) => sum + (t.capacity || 0), 0);
            const totalSold = tickets.reduce((sum, t) => sum + t.sold, 0);

            if (totalCapacity > 0) {
              const percentSold = totalSold / totalCapacity;
              if (percentSold >= 1) {
                status_label = "Sold Out";
              } else if (percentSold >= 0.85) {
                status_label = "Limited";
              } else if (percentSold >= 0.6) {
                status_label = "Selling Fast";
              }
            }
          }

          return {
            ...event,
            min_price,
            status_label,
          } as ListingEvent;
        });
      }
    } catch {
      // Fall through with empty events
    }
  }

  // ItemList JSON-LD — helps Google understand this is a collection of events
  const baseUrl = await getCanonicalBaseUrl(orgId);
  const eventsJsonLd = events.length > 0
    ? buildEventsListJsonLd({ events, siteUrl: baseUrl })
    : null;

  // ?ref=CODE auto-applies a rep's discount code
  const refCode = typeof sp.ref === "string" ? sp.ref : undefined;
  const refScript = refCode ? (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{sessionStorage.setItem("feral_popup_discount",${JSON.stringify(refCode)})}catch(e){}`,
      }}
    />
  ) : null;

  return (
    <>
      {eventsJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
        />
      )}
      {refScript}
      <EventsListPage events={events} branding={branding} />
    </>
  );
}
