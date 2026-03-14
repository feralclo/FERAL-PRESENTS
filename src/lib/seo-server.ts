import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * Resolve the canonical base URL for an org.
 * Queries the primary domain from the domains table.
 * Falls back to NEXT_PUBLIC_SITE_URL.
 *
 * Used by all public pages to set consistent canonical URLs,
 * ensuring Google consolidates SEO signals to one domain per tenant.
 *
 * Server-only — separated from seo.ts because that file is imported
 * by client components (SeoCard.tsx) which can't use next/headers.
 */
export async function getCanonicalBaseUrl(orgId: string): Promise<string> {
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
