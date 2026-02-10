// Default org_id for all Supabase queries — every table uses this for future multi-tenancy
export const ORG_ID = "feral";

// Supabase — fallbacks match original js/feral-settings.js (anon key, not secret)
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://rqtfghzhkkdytkegcifm.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdGZnaHpoa2tkeXRrZWdjaWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTUwMTUsImV4cCI6MjA4NTY5MTAxNX0.8IVDc92EYAq4FhTqVy0k5ur79zD9XofBBFjAuctKOUc";

// Supabase table names
export const TABLES = {
  SITE_SETTINGS: "site_settings",
  TRAFFIC_EVENTS: "traffic_events",
  POPUP_EVENTS: "popup_events",
  EVENTS: "events",
  TICKET_TYPES: "ticket_types",
  ORDERS: "orders",
  ORDER_ITEMS: "order_items",
  TICKETS: "tickets",
  CUSTOMERS: "customers",
  GUEST_LIST: "guest_list",
} as const;

// Settings keys stored in site_settings table
export const SETTINGS_KEYS = {
  LIVERPOOL: "feral_event_liverpool",
  KOMPASS: "feral_event_kompass",
  EVENTS_LIST: "feral_events_list",
} as const;

// Default ticket IDs (fallbacks if settings not loaded)
export const DEFAULT_TICKETS = {
  GENERAL: "6b45169f-cf51-4600-8682-d6f79dcb59ae",
  VIP: "bb73bb64-ba1a-4a23-9a05-f2b57bca51cf",
  VIP_TEE: "53c5262b-93ba-412e-bb5c-84ebc445a734",
} as const;

// Klaviyo
export const KLAVIYO_LIST_ID =
  process.env.NEXT_PUBLIC_KLAVIYO_LIST_ID || "SnE86f";
export const KLAVIYO_COMPANY_ID =
  process.env.NEXT_PUBLIC_KLAVIYO_COMPANY_ID || "Y8FS6L";

// WeeZTix
export const WEEZTIX_SHOP_ID =
  process.env.NEXT_PUBLIC_WEEZTIX_SHOP_ID ||
  "ad7b1eab-9c0b-4525-be60-be9c1c523dfe";

// GTM
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "GTM-MPZMXXBD";

// Discount
export const DISCOUNT_CODE = "FERALRAVER10";
export const POPUP_DISMISS_DAYS = 30;

// Fonts
export const FONT_HEADING = "Space Mono";
export const FONT_BODY = "Inter";
