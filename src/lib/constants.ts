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
  REPS: "reps",
  REP_EVENTS: "rep_events",
  REP_REWARDS: "rep_rewards",
  REP_MILESTONES: "rep_milestones",
  REP_POINTS_LOG: "rep_points_log",
  REP_QUESTS: "rep_quests",
  REP_QUEST_SUBMISSIONS: "rep_quest_submissions",
  REP_REWARD_CLAIMS: "rep_reward_claims",
  REP_EVENT_POSITION_REWARDS: "rep_event_position_rewards",
  REP_NOTIFICATIONS: "rep_notifications",
  ABANDONED_CARTS: "abandoned_carts",
  ARTISTS: "artists",
  EVENT_ARTISTS: "event_artists",
} as const;

// Settings keys stored in site_settings table
export const SETTINGS_KEYS = {
  EVENTS_LIST: "feral_events_list",
  MARKETING: "feral_marketing",
  EMAIL: "feral_email",
  WALLET_PASSES: "feral_wallet_passes",
  BRANDING: "feral_branding",
  VAT: "feral_vat",
  REPS: "feral_reps",
  POPUP: "feral_popup",
} as const;

/** Generate the branding settings key for a given org */
export function brandingKey(orgId: string): string {
  return `${orgId}_branding`;
}

/** Generate the themes settings key for a given org */
export function themesKey(orgId: string): string {
  return `${orgId}_themes`;
}

/** Generate the VAT settings key for a given org */
export function vatKey(orgId: string): string {
  return `${orgId}_vat`;
}

/** Generate the reps program settings key for a given org */
export function repsKey(orgId: string): string {
  return `${orgId}_reps`;
}

/** Generate the abandoned cart automation settings key for a given org */
export function abandonedCartAutomationKey(orgId: string): string {
  return `${orgId}_abandoned_cart_automation`;
}

/** Generate the popup settings key for a given org */
export function popupKey(orgId: string): string {
  return `${orgId}_popup`;
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
