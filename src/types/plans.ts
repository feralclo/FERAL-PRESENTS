export type PlanId = "starter" | "pro";

export interface PlatformPlan {
  id: PlanId;
  name: string;
  description: string;
  monthly_price: number;
  fee_percent: number;
  min_fee: number;
  card_rate_label: string;
  features: string[];
  trial_days: number;
}

export interface OrgPlanSettings {
  plan_id: PlanId;
  billing_waived: boolean;
  assigned_at: string;
  assigned_by: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_status?: "active" | "past_due" | "canceled" | "incomplete";
  current_period_end?: string;
}
