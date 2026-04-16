export type WaitlistStatus = "pending" | "notified" | "purchased" | "expired" | "removed";

export interface WaitlistSignup {
  id: string;
  org_id: string;
  event_id: string;
  customer_id: string | null;
  email: string;
  first_name: string | null;
  marketing_consent: boolean;
  status: WaitlistStatus;
  notification_token: string | null;
  notified_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaitlistSignupWithPosition extends WaitlistSignup {
  position: number;
}

/** Shape of waitlist settings stored inside event site_settings JSONB */
export interface WaitlistSettings {
  enabled: boolean;
  /** Custom subject line for the "you're on the list" confirmation email */
  confirmation_subject?: string;
  /** Custom body copy for the confirmation email */
  confirmation_body?: string;
  /** Custom subject line for the "a spot opened" notification email */
  notification_subject?: string;
  /** Custom body copy for the notification email */
  notification_body?: string;
  /** Hours before the notification token expires (default: 48) */
  token_ttl_hours?: number;
}
