"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/** Cache: platform-level Stripe instance (no connected account). */
let platformPromise: Promise<Stripe | null> | null = null;

/** Cache: connected account Stripe instances keyed by account ID.
 *  Avoids re-calling loadStripe on every checkout mount — saves ~100-200ms. */
const accountCache = new Map<string, Promise<Stripe | null>>();

/**
 * Get or create the Stripe.js instance.
 *
 * - No args → platform instance (cached as singleton).
 * - With stripeAccount → connected account instance (cached per account ID).
 *
 * Calling with no args first "pre-warms" the Stripe.js script download
 * so subsequent calls with a connected account resolve faster.
 */
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
