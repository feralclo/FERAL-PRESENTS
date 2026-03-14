import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * Per-tenant dynamic sitemap.
 *
 * Resolves the org from the request hostname, then lists only that tenant's
 * public events. Each domain serves its own sitemap with URLs pointing to itself.
 *
 * Previously this listed ALL tenants' events in one sitemap — Google ignores
 * cross-domain URLs in sitemaps, so other tenants' events were never indexed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const proto =
    headersList.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const baseUrl = host
    ? `${proto}://${host}`
    : process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";

  const entries: MetadataRoute.Sitemap = [];

  // Homepage
  entries.push({
    url: `${baseUrl}/`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1.0,
  });

  // Events listing page
  entries.push({
    url: `${baseUrl}/events/`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.9,
  });

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      // Resolve org_id from the request hostname
      const orgId = await resolveOrgFromHost(supabase, host);

      // Fetch all public, live events for THIS tenant only
      const { data: events } = await supabase
        .from(TABLES.EVENTS)
        .select("slug, updated_at")
        .eq("org_id", orgId)
        .eq("status", "live")
        .eq("visibility", "public")
        .order("date_start", { ascending: false })
        .limit(500);

      if (events) {
        for (const event of events) {
          entries.push({
            url: `${baseUrl}/event/${event.slug}/`,
            lastModified: event.updated_at
              ? new Date(event.updated_at)
              : new Date(),
            changeFrequency: "weekly",
            priority: 0.8,
          });
        }
      }
    }
  } catch {
    // Return at least the homepage + events listing
  }

  return entries;
}

/**
 * Resolve org_id from a hostname.
 * Mirrors the middleware's domain resolution logic:
 * 1. Query domains table for exact hostname match
 * 2. Wildcard subdomain: {slug}.entry.events → slug as org_id
 * 3. Fallback to "feral"
 */
async function resolveOrgFromHost(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  host: string
): Promise<string> {
  if (!host) return "feral";

  // Strip port for dev environments
  const hostname = host.split(":")[0];

  try {
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.DOMAINS)
        .select("org_id")
        .eq("hostname", hostname)
        .single();
      if (data?.org_id) return data.org_id;
    }
  } catch {
    // Not found in domains table — try subdomain pattern
  }

  // Wildcard subdomain: {slug}.entry.events → slug as org_id
  const match = hostname.match(/^([a-z0-9-]+)\.entry\.events$/);
  if (match) return match[1];

  return "feral";
}
