/** Traffic event types tracked through the funnel */
export type TrafficEventType =
  | "page_view"
  | "landing"
  | "tickets"
  | "checkout"
  | "purchase"
  | "add_to_cart"
  | "remove_from_cart"
  | "scroll_25"
  | "scroll_50"
  | "scroll_75"
  | "scroll_100"
  | "time_10s"
  | "time_30s"
  | "time_60s"
  | "time_120s"
  | "click_lineup"
  | "interact_tickets"
  | "checkout_start"
  | "payment_processing"
  | "payment_success"
  | "payment_failed"
  | "payment_method_selected"
  | "pdf_download"
  | "wallet_apple"
  | "wallet_google";

/** Shape of a traffic event row */
export interface TrafficEvent {
  id?: number;
  event_type: TrafficEventType;
  page_path: string;
  event_name?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  session_id: string;
  timestamp?: string;
  user_agent?: string;
  theme?: string;
  product_name?: string;
  product_price?: number;
  product_qty?: number;
  org_id?: string;
}

/** Popup event types */
export type PopupEventType =
  | "impressions"
  | "engaged"
  | "dismissed"
  | "conversions"
  | "clicked";

/** Shape of a popup event row */
export interface PopupEvent {
  id?: number;
  event_type: PopupEventType;
  page: string;
  timestamp?: string;
  user_agent?: string;
  org_id?: string;
}
