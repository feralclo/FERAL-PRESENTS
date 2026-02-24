export interface EventInterestSignup {
  id: string;
  org_id: string;
  event_id: string;
  customer_id: string;
  email: string;
  first_name?: string;
  signed_up_at: string;
  notified_at?: string;
  notification_count: number;
  unsubscribe_token: string;
  unsubscribed_at?: string;
  created_at: string;
}

export interface AnnouncementAutomationSettings {
  enabled: boolean;
  step_1_enabled: boolean;
  step_1_subject?: string;
  step_1_heading?: string;
  step_1_body?: string;
  step_2_enabled: boolean;
  step_2_subject?: string;
  step_2_heading?: string;
  step_2_body?: string;
  step_3_enabled: boolean;
  step_3_subject?: string;
  step_3_heading?: string;
  step_3_body?: string;
  step_4_enabled: boolean;
  step_4_subject?: string;
  step_4_heading?: string;
  step_4_body?: string;
  step_4_delay_hours: number;
}
