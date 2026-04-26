/**
 * Resolve the canonical base URL for a rep share link.
 *
 * Reps share quest URLs with friends. The recipient lands on an event
 * page where ?ref={code} silently auto-applies their discount. Which
 * domain serves that page matters — both for the discount logic (event
 * routing is per-tenant via middleware) and for the emotional read
 * ("this is from MY promoter", not from generic entry.events).
 *
 * Resolution rules:
 *   1. If the event's org has a primary custom/sub-domain in the
 *      domains table, use https://{hostname}.
 *   2. Otherwise fall back to NEXT_PUBLIC_SITE_URL (entry.events in
 *      production), which serves the platform-default tenant.
 *
 * Batched lookup: callers that build many URLs in one request (the
 * quest list endpoint) should fetch all primary domains for the unique
 * org_ids in one query and pass them in via the `domainsByOrgId` map.
 * The single-URL helper exists for endpoints that only need one (the
 * accept response).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

const DEFAULT_BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events").replace(/\/$/, "");

/**
 * Look up primary domains for a set of org_ids in one query.
 * Returns a map keyed by org_id → hostname (without protocol).
 */
export async function fetchPrimaryDomains(
  orgIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (orgIds.length === 0) return map;

  const supabase = await getSupabaseAdmin();
  if (!supabase) return map;

  const unique = Array.from(new Set(orgIds));
  const { data } = await supabase
    .from(TABLES.DOMAINS)
    .select("org_id, hostname")
    .in("org_id", unique)
    .eq("is_primary", true);

  for (const row of (data ?? []) as Array<{ org_id: string; hostname: string }>) {
    if (row.hostname) map.set(row.org_id, row.hostname);
  }
  return map;
}

/**
 * Build a quest share URL for a single (orgId, eventSlug, code) triple.
 * Returns null if eventSlug or code is missing — share URLs are useless
 * without both, so iOS treats null as "no share available".
 */
export function buildQuestShareUrl(params: {
  orgId: string | null;
  eventSlug: string | null;
  code: string | null;
  domainsByOrgId?: Map<string, string>;
}): string | null {
  const { orgId, eventSlug, code, domainsByOrgId } = params;
  if (!eventSlug || !code) return null;

  const hostname = orgId ? domainsByOrgId?.get(orgId) : undefined;
  const base = hostname ? `https://${hostname}` : DEFAULT_BASE;
  return `${base}/event/${eventSlug}?ref=${encodeURIComponent(code)}`;
}

/**
 * One-shot variant: resolve the domain inside the call. Convenient for
 * endpoints that only build a single URL (accept response).
 */
export async function buildQuestShareUrlOne(params: {
  orgId: string | null;
  eventSlug: string | null;
  code: string | null;
}): Promise<string | null> {
  const { orgId, eventSlug, code } = params;
  if (!eventSlug || !code) return null;
  if (!orgId) {
    return `${DEFAULT_BASE}/event/${eventSlug}?ref=${encodeURIComponent(code)}`;
  }
  const domains = await fetchPrimaryDomains([orgId]);
  return buildQuestShareUrl({ orgId, eventSlug, code, domainsByOrgId: domains });
}
