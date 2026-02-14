/** Shape of event settings stored in site_settings table (JSONB `data` column) */
export interface EventSettings {
  // Ticket IDs (WeeZTix/Eventix UUIDs)
  ticketId1?: string; // General Release
  ticketId2?: string; // VIP Ticket
  ticketId3?: string; // VIP Black + Tee
  ticketId4?: string; // Valentine's Special

  // Size-specific ticket IDs for VIP+Tee
  sizeIdXS?: string;
  sizeIdS?: string;
  sizeIdM?: string;
  sizeIdL?: string;
  sizeIdXL?: string;
  sizeIdXXL?: string;

  // Ticket display names
  ticketName1?: string;
  ticketName2?: string;
  ticketName3?: string;
  ticketName4?: string;

  // Ticket subtitles/descriptions
  ticketSubtitle1?: string;
  ticketSubtitle2?: string;
  ticketSubtitle3?: string;
  ticketSubtitle4?: string;

  // Ticket prices (WeeZTix — display prices, actual price from WeeZTix)
  ticketPrice1?: number;
  ticketPrice2?: number;
  ticketPrice3?: number;
  ticketPrice4?: number;

  // Ticket design tiers (WeeZTix — override the default tier per slot)
  ticketTier1?: string;
  ticketTier2?: string;
  ticketTier3?: string;
  ticketTier4?: string;

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
  // For WeeZTix events, keys are TicketKey strings (e.g. "general", "vip", "valentine")
  ticket_group_map?: Record<string, string | null>;

  // WeeZTix ticket display order — array of TicketKey strings
  // Controls the render order on the event page (e.g. ["general", "valentine", "vip", "vip-tee"])
  weeztixTicketOrder?: string[];

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

/** Row shape from site_settings table */
export interface SiteSettingsRow {
  key: string;
  data: EventSettings;
  updated_at: string;
}
