export type PlanId = "starter" | "pro";

export interface PlatformPlan {
  id: PlanId;
  name: string;
  description: string;
  monthly_price: number;
  fee_percent: number;
  min_fee: number;
  features: string[];
}

export interface OrgPlanSettings {
  plan_id: PlanId;
  billing_waived: boolean;
  assigned_at: string;
  assigned_by: string;
}
