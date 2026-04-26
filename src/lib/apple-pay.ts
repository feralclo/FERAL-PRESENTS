import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * Apple Pay domain sync helper — single source of truth for "make sure
 * every domain this org sells from is registered with Apple on the right
 * Stripe account."
 *
 * Why this exists: Apple verifies the domain in the buyer's browser URL
 * bar. If a buyer is on tickets.acme.com, Apple looks for THAT domain in
 * the registry. Subdomains aren't covered by parent-domain registrations
 * (entry.events being registered does NOT cover acme.entry.events).
 *
 * Worse, with direct charges on Connect, registration must happen on the
 * connected account (where the charge lands), not the platform. There's
 * no "wildcard" or "platform-fallback" route — Apple just won't show its
 * button if the domain isn't registered on the account that processes
 * the charge.
 *
 * So: every domain in our `domains` table needs to end up registered on
 * the right Stripe account. That account is:
 *   - the org's connected account (if configured + healthy)
 *   - the platform account (if no connected account — platform-owner case
 *     like feral)
 *
 * This function lists every active domain for the org and registers any
 * that aren't already on the account. Idempotent — safe to call on every
 * page load, every webhook, every domain-add. Fully fire-and-forget at
 * call sites: even total failure here doesn't block a payment.
 */

export interface DomainSyncResult {
  domain: string;
  status: "registered" | "already" | "failed" | "skipped";
  reason?: string;
}

export interface SyncOutcome {
  /** Stripe account the domains were registered on. */
  registered_on: string | "platform";
  results: DomainSyncResult[];
}

export async function syncOrgApplePayDomains(
  orgId: string,
): Promise<SyncOutcome> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Database not configured");
  }

  // 1) Active domains the org sells from.
  const { data: domains, error: domainsErr } = await supabase
    .from(TABLES.DOMAINS)
    .select("hostname")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (domainsErr) {
    throw new Error(`Failed to load domains: ${domainsErr.message}`);
  }
  if (!domains || domains.length === 0) {
    return { registered_on: "platform", results: [] };
  }

  // 2) Pick the right Stripe account: org's connected account if any,
  //    otherwise platform.
  const { data: settingRow } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", stripeAccountKey(orgId))
    .single();

  const stripeAccountId =
    (settingRow?.data as { account_id?: string } | undefined)?.account_id ||
    null;
  const opts = stripeAccountId
    ? { stripeAccount: stripeAccountId }
    : undefined;

  const stripe = getStripe();

  // 3) List existing registrations once, then only create the missing
  //    ones. Stripe's create endpoint 400s on duplicates rather than
  //    returning the existing row, so list-then-create is the clean path.
  let existing: Set<string>;
  try {
    const list = await stripe.applePayDomains.list({ limit: 100 }, opts);
    existing = new Set(list.data.map((d) => d.domain_name));
  } catch (err) {
    // Account might be inactive (capability not granted yet) — skip the
    // whole sync rather than try to create on a half-set-up account.
    const reason = err instanceof Error ? err.message : "list failed";
    return {
      registered_on: stripeAccountId || "platform",
      results: domains.map((d) => ({
        domain: d.hostname,
        status: "skipped" as const,
        reason,
      })),
    };
  }

  // 4) Register each missing domain. Errors per-domain don't abort the
  //    others — one bad apple shouldn't block the rest.
  const results: DomainSyncResult[] = [];
  for (const { hostname } of domains) {
    if (existing.has(hostname)) {
      results.push({ domain: hostname, status: "already" });
      continue;
    }
    try {
      await stripe.applePayDomains.create(
        { domain_name: hostname },
        opts,
      );
      results.push({ domain: hostname, status: "registered" });
      console.log(
        `[apple-pay] Registered ${hostname} on ${stripeAccountId || "platform"}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "create failed";
      results.push({ domain: hostname, status: "failed", reason });
      Sentry.captureException(err, {
        extra: { orgId, hostname, stripeAccountId },
      });
      console.error(
        `[apple-pay] Failed to register ${hostname}: ${reason}`,
      );
    }
  }

  return {
    registered_on: stripeAccountId || "platform",
    results,
  };
}
