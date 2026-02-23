import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, planKey, platformBillingKey } from "@/lib/constants";
import { getStripe } from "@/lib/stripe/server";
import type { PlanId, PlatformPlan, OrgPlanSettings } from "@/types/plans";

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

/**
 * Get the full plan for an org, with fee rates.
 * Falls back to Starter if no plan is assigned.
 */
export async function getOrgPlan(orgId: string): Promise<PlatformPlan> {
  const settings = await getOrgPlanSettings(orgId);
  if (settings) {
    return PLANS[settings.plan_id] ?? PLANS.starter;
  }
  return PLANS.starter;
}

/**
 * Get raw plan settings for an org (for admin display).
 * Returns null if no plan has been explicitly assigned.
 */
export async function getOrgPlanSettings(
  orgId: string
): Promise<OrgPlanSettings | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", planKey(orgId))
    .single();

  if (data?.data && typeof data.data === "object") {
    return data.data as OrgPlanSettings;
  }
  return null;
}

/**
 * Partial-update helper for org plan settings.
 * Merges provided fields into the existing settings (or creates new).
 */
export async function updateOrgPlanSettings(
  orgId: string,
  updates: Partial<OrgPlanSettings>
): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  const existing = await getOrgPlanSettings(orgId);
  const merged = { ...existing, ...updates };

  await supabase
    .from(TABLES.SITE_SETTINGS)
    .upsert(
      {
        key: planKey(orgId),
        data: merged,
        org_id: orgId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
}

/**
 * Ensure the platform Stripe Product + Price exist for Pro plan billing.
 * Auto-creates on first use and caches IDs in site_settings.
 * Returns the Stripe Price ID for use in Checkout Sessions.
 */
export async function ensureStripePriceExists(): Promise<string> {
  const stripe = getStripe();
  const supabase = await getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  // Check for cached IDs
  const { data: cached } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", platformBillingKey())
    .single();

  if (cached?.data && typeof cached.data === "object") {
    const billing = cached.data as { product_id: string; price_id: string };
    if (billing.product_id && billing.price_id) {
      return billing.price_id;
    }
  }

  // Create Stripe Product
  const product = await stripe.products.create({
    name: "Entry Pro Plan",
    description: "Pro plan subscription — reduced platform fees",
    metadata: { platform: "entry" },
  });

  // Create Stripe Price (£29/month recurring)
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: PLANS.pro.monthly_price,
    currency: "gbp",
    recurring: { interval: "month" },
    metadata: { platform: "entry", plan_id: "pro" },
  });

  // Cache in site_settings
  await supabase.from(TABLES.SITE_SETTINGS).upsert(
    {
      key: platformBillingKey(),
      data: { product_id: product.id, price_id: price.id },
      org_id: "platform",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  return price.id;
}
