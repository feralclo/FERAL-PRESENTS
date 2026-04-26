/**
 * Pure plan data — no Supabase / Stripe / next/headers imports.
 *
 * Lives in its own file so client components (e.g. the onboarding wizard's
 * fee-preview panel) can read plan rates without dragging server-only
 * modules through Turbopack's bundling.
 *
 * `lib/plans.ts` re-exports `PLANS` from here for backwards compat.
 */

import type { PlanId, PlatformPlan } from "@/types/plans";

/**
 * Platform plans.
 *
 * fee_percent / min_fee = Entry's application_fee (what we actually send to Stripe).
 * card_rate_percent / card_rate_fixed / card_rate_label = total advertised rate
 *   shown to the promoter (Entry fee + Stripe processing bundled together).
 *
 * Stripe UK processing is ~1.5% + 20p. We absorb this into the advertised rate
 * so the promoter sees one clean number that matches their actual deductions.
 */
export const PLANS: Record<PlanId, PlatformPlan> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Everything you need to sell tickets",
    monthly_price: 0,
    fee_percent: 3.5,       // Entry's cut (application_fee)
    min_fee: 30,             // 30p minimum application_fee
    card_rate_percent: 5,    // Total advertised: 5% (Entry 3.5% + Stripe ~1.5%)
    card_rate_fixed: 50,     // Total advertised: 50p (Entry 30p + Stripe ~20p)
    card_rate_label: "5% + 50p",
    trial_days: 0,
    features: [
      "Unlimited events",
      "Ticket sales & checkout",
      "QR code tickets",
      "Custom branding",
      "Analytics dashboard",
      "Discount codes",
      "Guest list management",
      "Email confirmations",
      "Apple & Google Wallet",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Lower rates & rep platform for growing promoters",
    monthly_price: 2900, // £29.00 in pence
    fee_percent: 2,          // Entry's cut (application_fee)
    min_fee: 10,             // 10p minimum application_fee
    card_rate_percent: 3.5,  // Total advertised: 3.5% (Entry 2% + Stripe ~1.5%)
    card_rate_fixed: 30,     // Total advertised: 30p (Entry 10p + Stripe ~20p)
    card_rate_label: "3.5% + 30p",
    trial_days: 14,
    features: [
      "Everything in Starter",
      "Lower card rates",
      "Rep ambassador platform",
      "Priority support",
    ],
  },
};
