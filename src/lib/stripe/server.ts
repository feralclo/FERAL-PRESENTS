import Stripe from "stripe";
import { logPaymentEvent } from "@/lib/payment-monitor";

/**
 * Server-side Stripe instance (platform account).
 * Used for creating PaymentIntents, managing Connect accounts, etc.
 */
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey && process.env.NODE_ENV === "production") {
  console.warn("STRIPE_SECRET_KEY is not set — Stripe features will be disabled.");
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2026-01-28.clover",
      typescript: true,
    })
  : null;

/**
 * Get the Stripe instance, throwing if not configured.
 * Use in API routes that require Stripe.
 */
export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }
  return stripe;
}

/**
 * In-memory cache for verified connected accounts.
 * Avoids calling stripe.accounts.retrieve() on every checkout load while
 * still catching stale/revoked accounts within a few minutes.
 */
interface VerifiedAccountEntry {
  result: string | null;
  capabilities: Record<string, string>;
  expiresAt: number;
}
const verifiedAccountCache = new Map<string, VerifiedAccountEntry>();
const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify a connected Stripe account is accessible AND ready to take charges.
 *
 * Returns the account ID if:
 *   - account is retrievable from the platform key
 *   - card_payments capability is "active" (i.e. KYC is far enough along
 *     for Stripe to actually accept charges on this account)
 *
 * Returns null if:
 *   - the account was deleted / access revoked → caller falls back
 *   - card_payments capability is anything other than "active" (inactive,
 *     pending, unrequested) — most commonly: tenant created the account
 *     via /admin/payments but hasn't completed KYC. Returning null here
 *     lets the caller decide whether to fail loudly (correct for tenants
 *     with a configured account) or fall back (correct only when no
 *     account is configured at all).
 *
 * Results are cached in-memory for 5 minutes so repeated checkout loads
 * skip the Stripe API call (~100-300ms) after the first verification. The
 * cache is short enough that a tenant finishing KYC sees their checkout
 * unblock within minutes, not hours.
 */
export async function verifyConnectedAccount(
  accountId: string | null,
  orgId?: string
): Promise<string | null> {
  if (!accountId || !stripe) return null;

  const cached = verifiedAccountCache.get(accountId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const caps: Record<string, string> = {};
    if (account.capabilities) {
      for (const [key, val] of Object.entries(account.capabilities)) {
        caps[key] = val;
      }
    }

    const cardPaymentsActive = caps.card_payments === "active";

    if (!cardPaymentsActive) {
      // Account exists but can't take charges. Cache the null result so we
      // don't hammer Stripe on every checkout while the tenant finishes
      // KYC. Surface as connect_account_unhealthy so it shows up in the
      // health dashboard and triggers a tenant-facing alert.
      verifiedAccountCache.set(accountId, {
        result: null,
        capabilities: caps,
        expiresAt: Date.now() + VERIFY_CACHE_TTL_MS,
      });
      if (orgId) {
        logPaymentEvent({
          orgId,
          type: "connect_account_unhealthy",
          stripeAccountId: accountId,
          errorCode: "card_payments_inactive",
          errorMessage: `card_payments=${caps.card_payments || "missing"}; transfers=${caps.transfers || "missing"}`,
        });
      }
      return null;
    }

    verifiedAccountCache.set(accountId, {
      result: accountId,
      capabilities: caps,
      expiresAt: Date.now() + VERIFY_CACHE_TTL_MS,
    });
    return accountId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[stripe] Connected account ${accountId} is not accessible — ` +
        `falling back to platform account. Error: ${msg}`
    );
    verifiedAccountCache.set(accountId, {
      result: null,
      capabilities: {},
      expiresAt: Date.now() + VERIFY_CACHE_TTL_MS,
    });
    if (orgId) {
      logPaymentEvent({
        orgId,
        type: "connect_fallback",
        stripeAccountId: accountId,
        errorMessage: msg,
      });
    }
    return null;
  }
}

/**
 * Get cached capabilities for a connected account.
 * Must call verifyConnectedAccount() first to populate the cache.
 */
export function getAccountCapabilities(
  accountId: string | null
): Record<string, string> {
  if (!accountId) return {};
  const cached = verifiedAccountCache.get(accountId);
  return cached?.capabilities || {};
}
