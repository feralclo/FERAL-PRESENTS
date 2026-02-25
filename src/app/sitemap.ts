import type { MetadataRoute } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * Dynamic sitemap — lists all public, live events across all tenants.
 * Google crawls this to discover event pages for indexing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";
  const entries: MetadataRoute.Sitemap = [];

  // Homepage
  entries.push({
    url: siteUrl,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1.0,
  });

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      // Fetch all public, live events with their org domain
      const { data: events } = await supabase
        .from(TABLES.EVENTS)
        .select("slug, updated_at, org_id")
        .eq("status", "live")
        .eq("visibility", "public")
        .order("date_start", { ascending: false })
        .limit(500);

      if (events) {
        // Build org → primary domain map
        const orgIds = [...new Set(events.map((e) => e.org_id))];
        const { data: domains } = await supabase
          .from(TABLES.DOMAINS)
          .select("org_id, hostname")
          .in("org_id", orgIds)
          .eq("is_primary", true);

        const domainMap = new Map<string, string>();
        if (domains) {
          for (const d of domains) {
            domainMap.set(d.org_id, `https://${d.hostname}`);
          }
        }

        for (const event of events) {
          const base = domainMap.get(event.org_id) || siteUrl;
          entries.push({
            url: `${base}/event/${event.slug}`,
            lastModified: event.updated_at ? new Date(event.updated_at) : new Date(),
            changeFrequency: "weekly",
            priority: 0.8,
          });
        }
      }
    }
  } catch {
    // Return at least the homepage
  }

  return entries;
}
