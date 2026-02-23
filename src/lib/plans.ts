import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, planKey } from "@/lib/constants";
import type { PlanId, PlatformPlan, OrgPlanSettings } from "@/types/plans";

export const PLANS: Record<PlanId, PlatformPlan> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Free plan for new promoters",
    monthly_price: 0,
    fee_percent: 5,
    min_fee: 50, // £0.50
    features: [
      "Unlimited events",
      "Ticket sales & checkout",
      "QR code tickets",
      "Basic analytics",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Lower fees for established promoters",
    monthly_price: 2900, // £29.00 in pence
    fee_percent: 2.5,
    min_fee: 30, // £0.30
    features: [
      "Everything in Starter",
      "Reduced platform fees",
      "Priority support",
      "Custom branding",
      "Advanced analytics",
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
