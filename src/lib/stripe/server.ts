import Stripe from "stripe";

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
const verifiedAccountCache = new Map<
  string,
  { result: string | null; expiresAt: number }
>();
const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify a connected Stripe account is accessible from the platform key.
 * Returns the account ID if valid, or null if the account doesn't exist /
 * access was revoked. This prevents checkout failures when a stale or
 * invalid account ID is stored in the database.
 *
 * Results are cached in-memory for 5 minutes so repeated checkout loads
 * skip the Stripe API call (~100-300ms) after the first verification.
 */
export async function verifyConnectedAccount(
  accountId: string | null
): Promise<string | null> {
  if (!accountId || !stripe) return null;

  const cached = verifiedAccountCache.get(accountId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    await stripe.accounts.retrieve(accountId);
    verifiedAccountCache.set(accountId, {
      result: accountId,
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
      expiresAt: Date.now() + VERIFY_CACHE_TTL_MS,
    });
    return null;
  }
}
