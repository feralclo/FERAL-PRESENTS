"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Get or create the Stripe.js instance for the platform.
 * For Connect direct charges, pass stripeAccount to load with connected account context.
 */
export function getStripeClient(stripeAccount?: string): Promise<Stripe | null> {
  if (!publishableKey) {
    console.warn("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    return Promise.resolve(null);
  }

  // If a connected account is specified, create a new instance (not cached globally)
  if (stripeAccount) {
    return loadStripe(publishableKey, { stripeAccount });
  }

  // Cache the platform-level instance
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }

  return stripePromise;
}
