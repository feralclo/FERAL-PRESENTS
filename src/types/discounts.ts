export type DiscountType = "percentage" | "fixed";
export type DiscountStatus = "active" | "inactive";

export interface Discount {
  id: string;
  org_id: string;
  code: string;
  description?: string;
  type: DiscountType;
  /** For percentage: 0–100. For fixed: amount in major currency units (e.g. £5 = 5). */
  value: number;
  /** Minimum order subtotal required (major currency units). Null = no minimum. */
  min_order_amount?: number | null;
  /** Maximum total uses. Null = unlimited. */
  max_uses?: number | null;
  /** Current number of times this code has been redeemed. */
  used_count: number;
  /** Restrict to specific events. Null = all events. */
  applicable_event_ids?: string[] | null;
  /** When the code becomes valid. Null = immediately. */
  starts_at?: string | null;
  /** When the code expires. Null = never. */
  expires_at?: string | null;
  status: DiscountStatus;
  created_at: string;
  updated_at: string;
}

/** Result from the validate endpoint — what the checkout needs. */
export interface DiscountValidation {
  valid: boolean;
  discount?: {
    id: string;
    code: string;
    type: DiscountType;
    value: number;
  };
  error?: string;
}
