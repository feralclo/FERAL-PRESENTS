/**
 * Resolve the canonical base URL for a rep share link.
 *
 * Reps share quest URLs with friends. The recipient lands on the
 * destination page where ?ref={code} silently auto-applies their
 * discount. Which domain serves that page matters — both for the
 * discount logic (routing is per-tenant via middleware) and for the
 * emotional read ("this is from MY promoter").
 *
 * Resolution rules — base URL:
 *   1. If the org has a primary custom/sub-domain in the `domains`
 *      table, use `https://{hostname}`.
 *   2. Otherwise fall back to NEXT_PUBLIC_SITE_URL (entry.events in
 *      production).
 *
 * Resolution rules — destination path (cascade — invariant: if a
 * `code` is provided, a non-null URL is ALWAYS returned):
 *   1. Event slug present → `/event/{slug}?ref={code}` (the canonical
 *      "share this event" surface).
 *   2. No event slug → `/?ref={code}` (tenant root). The discount still
 *      applies wherever the recipient lands; pool / promoter-only
 *      quests get a working share without falling into iOS's
 *      "spinning up your link…" empty state.
 *   3. No `code` → null. A share without a discount has no meaning.
 *
 * Batched lookup: callers that build many URLs in one request (the
 * quest list endpoint) should fetch all primary domains for the unique
 * org_ids in one query and pass them in via the `domainsByOrgId` map.
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
 * Build a quest share URL with a cascade so quests that aren't
 * event-anchored (pool quests bound only to a promoter, platform-level
 * quests, etc.) still produce a working link.
 *
 * Returns null only when `code` is null — a share without a discount
 * is a dead share, and iOS's "no share available" empty state is the
 * right surface for that single case.
 *
 * Otherwise:
 *   - With an event slug → /event/{slug}?ref={code}
 *   - Without an event slug → /?ref={code} (tenant root)
 *
 * The tenant-root fallback is meaningful: ?ref= is read globally by
 * the buyer-side stack, so the discount still applies wherever the
 * recipient navigates to (campaign pages, the next event, the merch
 * store, anything).
 */
export function buildQuestShareUrl(params: {
  orgId: string | null;
  eventSlug: string | null;
  code: string | null;
  domainsByOrgId?: Map<string, string>;
}): string | null {
  const { orgId, eventSlug, code, domainsByOrgId } = params;
  if (!code) return null;

  const hostname = orgId ? domainsByOrgId?.get(orgId) : undefined;
  const base = hostname ? `https://${hostname}` : DEFAULT_BASE;
  if (eventSlug) {
    return `${base}/event/${eventSlug}?ref=${encodeURIComponent(code)}`;
  }
  // No event — tenant root. Same shape as buildRepShareUrl. Discount
  // still applies platform-wide via the ?ref= cookie set by middleware.
  return `${base}/?ref=${encodeURIComponent(code)}`;
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
  if (!code) return null;
  const domains = orgId ? await fetchPrimaryDomains([orgId]) : new Map();
  return buildQuestShareUrl({ orgId, eventSlug, code, domainsByOrgId: domains });
}

/**
 * Build a rep-level share URL for the dashboard masthead — root of the
 * tenant with ?ref= applied. Distinct from buildQuestShareUrl, which
 * targets a specific event page; this one is "share my promoter" rather
 * than "share this event". Returns null if no code (rep has no approved
 * membership with a discount_code yet — iOS hides the CTA).
 *
 * Same domain-resolution contract as the quest builder so iOS doesn't
 * have to lift the host from a quest entry to find the rep's own tenant.
 */
export function buildRepShareUrl(params: {
  orgId: string | null;
  code: string | null;
  domainsByOrgId?: Map<string, string>;
}): string | null {
  const { orgId, code, domainsByOrgId } = params;
  if (!code) return null;

  const hostname = orgId ? domainsByOrgId?.get(orgId) : undefined;
  const base = hostname ? `https://${hostname}` : DEFAULT_BASE;
  return `${base}/?ref=${encodeURIComponent(code)}`;
}
