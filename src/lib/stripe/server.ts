import Stripe from "stripe";

/**
 * Server-side Stripe instance (platform account).
 * Used for creating PaymentIntents, managing Connect accounts, etc.
 */
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey && process.env.NODE_ENV === "production") {
  throw new Error("STRIPE_SECRET_KEY is required in production");
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
