export type EventStatus = "draft" | "live" | "past" | "cancelled" | "archived";
export type EventVisibility = "public" | "private" | "unlisted";
export type PaymentMethod = "weeztix" | "test" | "stripe";

export interface Event {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  city?: string;
  country?: string;
  date_start: string;
  date_end?: string;
  doors_open?: string;
  age_restriction?: string;
  status: EventStatus;
  visibility: EventVisibility;
  payment_method: PaymentMethod;
  capacity?: number;
  cover_image?: string;
  hero_image?: string;
  theme?: string;
  settings_key?: string;
  currency: string;
  about_text?: string;
  lineup?: string[];
  details_text?: string;
  tag_line?: string;
  doors_time?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketTypeRow {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  description?: string;
  price: number;
  capacity?: number;
  sold: number;
  sort_order: number;
  includes_merch: boolean;
  merch_type?: string;
  merch_sizes?: string[];
  status: "active" | "hidden" | "sold_out" | "archived";
  sale_start?: string;
  sale_end?: string;
  min_per_order: number;
  max_per_order: number;
  tier?: "standard" | "platinum" | "black";
  created_at: string;
  updated_at: string;
}
