export interface EventInterestSignup {
  id: string;
  org_id: string;
  event_id: string;
  customer_id: string;
  email: string;
  first_name?: string;
  signed_up_at: string;
  notified_at?: string;
  created_at: string;
}
