"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/** Cache: platform-level Stripe instance (no connected account). */
let platformPromise: Promise<Stripe | null> | null = null;

/** Cache: connected account Stripe instances keyed by account ID.
 *  Avoids re-calling loadStripe on every checkout mount — saves ~100-200ms. */
const accountCache = new Map<string, Promise<Stripe | null>>();

/* ── Stripe account preloading ────────────────────────────────────────
 * Caches the /api/stripe/account fetch at module level so the result
 * is ready instantly when ExpressCheckout mounts.
 */
export interface StripeAccountInfo {
  stripe_account_id?: string;
  capabilities: Record<string, string>;
}
let _accountInfoPromise: Promise<StripeAccountInfo> | null = null;

/**
 * Preload the connected Stripe account info (ID + capabilities).
 * Returns a cached promise — safe to call multiple times.
 */
export function preloadStripeAccountInfo(): Promise<StripeAccountInfo> {
  if (!_accountInfoPromise) {
    _accountInfoPromise = fetch("/api/stripe/account")
      .then((res) => res.json())
      .then((data) => ({
        stripe_account_id: data.stripe_account_id || undefined,
        capabilities: data.capabilities || {},
      }))
      .catch(() => ({ capabilities: {} }));
  }
  return _accountInfoPromise;
}

/**
 * Preload the connected Stripe account ID.
 * Returns a cached promise — safe to call multiple times.
 */
export function preloadStripeAccount(): Promise<string | undefined> {
  return preloadStripeAccountInfo().then((info) => info.stripe_account_id);
}

/**
 * Kick off Stripe.js download AND account fetch in parallel.
 * Call this early (e.g. on ticket widget mount) so both are cached
 * by the time the user adds a ticket and ExpressCheckout renders.
 */
export function preloadStripe(): void {
  getStripeClient(); // start Stripe.js download
  preloadStripeAccount(); // start account fetch
}

export function getStripeClient(stripeAccount?: string): Promise<Stripe | null> {
  if (!publishableKey) {
    console.warn("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    return Promise.resolve(null);
  }

  if (stripeAccount) {
    const cached = accountCache.get(stripeAccount);
    if (cached) return cached;
    const promise = loadStripe(publishableKey, { stripeAccount });
    accountCache.set(stripeAccount, promise);
    return promise;
  }

  if (!platformPromise) {
    platformPromise = loadStripe(publishableKey);
  }

  return platformPromise;
}
