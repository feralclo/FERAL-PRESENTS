export type EventStatus = "draft" | "live" | "past" | "cancelled" | "archived";
export type EventVisibility = "public" | "private" | "unlisted";
export type PaymentMethod = "test" | "stripe" | "external";

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
  /** Stripe Connect account ID for the promoter running this event */
  stripe_account_id?: string;
  /** Platform fee percentage override for this event (default: 5%) */
  platform_fee_percent?: number;
  /** External ticket link (used when payment_method is "external") */
  external_link?: string;
  /** Per-event VAT override: NULL = use org default, true = VAT enabled, false = no VAT */
  vat_registered?: boolean | null;
  /** Per-event VAT rate override (e.g. 20 = 20%). NULL = use org default */
  vat_rate?: number | null;
  /** Per-event prices-include-VAT override. NULL = use org default */
  vat_prices_include?: boolean | null;
  /** Per-event VAT number override. NULL = use org default */
  vat_number?: string | null;
  /** When set, tickets are only purchasable after this timestamp. NULL = immediate. */
  tickets_live_at?: string | null;
  /** Custom heading for the coming-soon widget. NULL = "Coming Soon" */
  announcement_title?: string | null;
  /** Custom subtitle for the coming-soon widget. NULL = default text */
  announcement_subtitle?: string | null;
  /** Whether the hype queue is enabled for this event */
  queue_enabled?: boolean | null;
  /** How long the queue experience lasts in seconds (default 45) */
  queue_duration_seconds?: number | null;
  /** How many minutes after tickets_live_at the queue remains active (default 60) */
  queue_window_minutes?: number | null;
  /** Custom title for the queue page. NULL = "You're in the queue" */
  queue_title?: string | null;
  /** Custom subtitle for the queue page. NULL = "Securing your spot — don't close this tab" */
  queue_subtitle?: string | null;
  created_at: string;
  updated_at: string;
  /** When true, lineup is displayed alphabetically (A-Z) and manual reordering is locked */
  lineup_sort_alphabetical?: boolean;
  /** Joined event_artists with artist profiles (populated when fetched with join) */
  event_artists?: import("./artists").EventArtist[];
}

/** Lightweight event shape for landing page cards (no ticket_types needed) */
export interface LandingEvent {
  id: string;
  slug: string;
  name: string;
  date_start: string;
  venue_name?: string;
  city?: string;
  cover_image?: string;
  tag_line?: string;
  doors_time?: string;
  payment_method: string;
  external_link?: string;
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
  merch_name?: string;
  merch_type?: string;
  merch_sizes?: string[];
  merch_description?: string;
  merch_images?: string[] | { front?: string; back?: string };
  status: "active" | "hidden" | "sold_out" | "archived";
  sale_start?: string;
  sale_end?: string;
  min_per_order: number;
  max_per_order: number;
  tier?: "standard" | "platinum" | "black" | "valentine";
  /** Linked product ID (nullable — backward compatible with inline merch) */
  product_id?: string;
  /** Joined product data (populated when fetched with join) */
  product?: import("./products").Product;
  created_at: string;
  updated_at: string;
}
