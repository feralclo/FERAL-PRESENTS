export type PlanId = "starter" | "pro";

export interface PlatformPlan {
  id: PlanId;
  name: string;
  description: string;
  monthly_price: number;
  /** Entry's actual application_fee percentage (internal — sent to Stripe) */
  fee_percent: number;
  /** Entry's actual application_fee minimum in pence (internal — sent to Stripe) */
  min_fee: number;
  /** Total advertised rate label shown to promoter (includes Stripe processing) */
  card_rate_label: string;
  /** Total advertised percentage (for "you keep" calculations on plan page) */
  card_rate_percent: number;
  /** Total advertised fixed fee in pence (for "you keep" calculations on plan page) */
  card_rate_fixed: number;
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
