/** Shape of event settings stored in site_settings table (JSONB `data` column) */
export interface EventSettings {
  // Theme
  theme?: "minimal" | "default" | null;
  minimalBgEnabled?: boolean;
  minimalBgImage?: string;
  minimalBlurStrength?: number;
  minimalStaticStrength?: number;

  // Lineup
  lineup?: string[];

  // Images
  heroImage?: string;   // Banner image (URL or base64)
  teeFront?: string;    // Tee front view (URL or base64)
  teeBack?: string;     // Tee back view (URL or base64)
  coverImage?: string;

  // Ticket Groups — organise ticket types into named sections (e.g. "VIP Experiences")
  // Stored as array of group names; null/undefined group = default ungrouped section
  ticket_groups?: string[];
  // Map ticket_type ID → group name (null = default ungrouped section)
  ticket_group_map?: Record<string, string | null>;

  /** Show sticky checkout bar on mobile (default: true) */
  sticky_checkout_bar?: boolean;

  // Any additional dynamic fields
  [key: string]: unknown;
}

/**
 * Org-level branding settings — stored in site_settings under key `{org_id}_branding`.
 * Controls white-label appearance: checkout header, emails, PDF tickets, event pages.
 * Each tenant (org) can customize these independently.
 */
export interface BrandingSettings {
  /** Display name of the org/promoter (shown in header, footer, emails) */
  org_name?: string;
  /** Logo URL or base64 (used in checkout header, emails, PDF tickets) */
  logo_url?: string;
  /** Logo width in pixels for checkout header (default: auto) */
  logo_width?: number;
  /** Primary accent color (hex) — used for buttons, links, highlights */
  accent_color?: string;
  /** Background color (hex) — defaults to #0e0e0e */
  background_color?: string;
  /** Card/section background color (hex) — defaults to #1a1a1a */
  card_color?: string;
  /** Primary text color (hex) — defaults to #ffffff */
  text_color?: string;
  /** Heading font family — defaults to Space Mono */
  heading_font?: string;
  /** Body font family — defaults to Inter */
  body_font?: string;
  /** Copyright text — e.g. "© 2026 ACME EVENTS" */
  copyright_text?: string;
  /** Support email for the org */
  support_email?: string;
  /** Social links */
  social_links?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
    website?: string;
  };
}

/**
 * Event-level theme overrides — stored in site_settings under key `{event_settings_key}_theme`
 * or directly in the events table `theme` column as a JSON string.
 * These override org-level branding for a specific event.
 */
export interface EventThemeOverrides {
  /** Accent color override for this event */
  accent_color?: string;
  /** Background color override */
  background_color?: string;
  /** Hero overlay opacity (0-1) */
  hero_overlay_opacity?: number;
  /** Custom CSS class to apply to event page */
  custom_class?: string;
}

/**
 * StoreTheme — a saved theme configuration.
 * Each org can have multiple themes; one is active at a time.
 * Stored in site_settings under key `{org_id}_themes`.
 */
export interface StoreTheme {
  /** Unique theme ID (UUID) */
  id: string;
  /** Display name (e.g. "Midnight", "Daylight", "My Custom Theme") */
  name: string;
  /** Base template this theme was created from */
  template: "midnight" | "aura" | "custom";
  /** Full branding configuration for this theme */
  branding: BrandingSettings;
  /** ISO timestamp when theme was created */
  created_at: string;
  /** ISO timestamp when theme was last modified */
  updated_at: string;
}

/**
 * ThemeStore — the complete themes state for an org.
 * Stored as the `data` field in site_settings under key `{org_id}_themes`.
 */
export interface ThemeStore {
  /** ID of the currently active theme */
  active_theme_id: string;
  /** All saved themes for this org */
  themes: StoreTheme[];
}

/**
 * VAT / Tax settings — stored in site_settings under key `{org_id}_vat`.
 * Controls whether the org charges VAT on tickets and merch.
 */
export interface VatSettings {
  /** Whether the org is VAT-registered */
  vat_registered: boolean;
  /** VAT registration number (e.g. "GB123456789") */
  vat_number: string;
  /** VAT rate as a percentage (e.g. 20 = 20%) */
  vat_rate: number;
  /**
   * When true, listed prices already include VAT (standard UK B2C).
   * Checkout shows "Includes £X.XX VAT" — total unchanged.
   *
   * When false, VAT is added on top of the listed price.
   * Checkout shows "VAT (20%): £X.XX" — total increases.
   */
  prices_include_vat: boolean;
}

/**
 * Discount popup settings — stored in site_settings under key `{org_id}_popup`.
 * Controls the 3-screen discount popup on event pages.
 */
export interface PopupSettings {
  /** Master on/off toggle */
  enabled: boolean;
  /** Discount code to reveal after email capture */
  discount_code: string;
  /** Screen 1 headline */
  headline: string;
  /** Screen 1 subheadline */
  subheadline: string;
  /** Screen 1 CTA button text */
  cta_text: string;
  /** Screen 1 dismiss button text */
  dismiss_text: string;
  /** Delay before popup shows on mobile (ms) */
  mobile_delay: number;
  /** Delay before popup shows on desktop (ms) */
  desktop_delay: number;
  /** Days to suppress popup after dismiss */
  dismiss_days: number;
  /** Countdown timer starting value in seconds */
  countdown_seconds: number;
  /** Whether to trigger on desktop exit intent (mouse leaves viewport) */
  exit_intent: boolean;
  /** Whether to subscribe emails to Klaviyo */
  klaviyo_enabled: boolean;
}

/** Row shape from site_settings table */
export interface SiteSettingsRow {
  key: string;
  data: EventSettings;
  updated_at: string;
}
