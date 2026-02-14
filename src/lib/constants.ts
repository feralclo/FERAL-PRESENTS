// Default org_id for all Supabase queries — every table uses this for future multi-tenancy
export const ORG_ID = "feral";

// Supabase — require env vars, no hardcoded fallbacks
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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
  PRODUCTS: "products",
  DISCOUNTS: "discounts",
} as const;

// Settings keys stored in site_settings table
export const SETTINGS_KEYS = {
  EVENTS_LIST: "feral_events_list",
  MARKETING: "feral_marketing",
  EMAIL: "feral_email",
  WALLET_PASSES: "feral_wallet_passes",
  BRANDING: "feral_branding",
} as const;

/** Generate the branding settings key for a given org */
export function brandingKey(orgId: string): string {
  return `${orgId}_branding`;
}

/** Generate the themes settings key for a given org */
export function themesKey(orgId: string): string {
  return `${orgId}_themes`;
}

// Klaviyo
export const KLAVIYO_LIST_ID =
  process.env.NEXT_PUBLIC_KLAVIYO_LIST_ID || "SnE86f";
export const KLAVIYO_COMPANY_ID =
  process.env.NEXT_PUBLIC_KLAVIYO_COMPANY_ID || "Y8FS6L";

// GTM
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "GTM-MPZMXXBD";

// Discount
export const DISCOUNT_CODE = "FERALRAVER10";
export const POPUP_DISMISS_DAYS = 30;

// Fonts
export const FONT_HEADING = "Space Mono";
export const FONT_BODY = "Inter";
