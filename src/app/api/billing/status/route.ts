import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrgPlan, getOrgPlanSettings, PLANS } from "@/lib/plans";

/**
 * GET /api/billing/status
 *
 * Returns the current plan, subscription status, and fee rates
 * for the authenticated org. Single endpoint for the plan page.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { orgId } = auth;

  const [plan, planSettings] = await Promise.all([
    getOrgPlan(orgId),
    getOrgPlanSettings(orgId),
  ]);

  return NextResponse.json({
    current_plan: plan,
    plan_settings: planSettings || {
      plan_id: "starter" as const,
      billing_waived: false,
      assigned_at: "",
      assigned_by: "",
    },
    plans: PLANS,
  });
}
