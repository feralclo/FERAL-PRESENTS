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

  // Any additional dynamic fields
  [key: string]: unknown;
}

/** Row shape from site_settings table */
export interface SiteSettingsRow {
  key: string;
  data: EventSettings;
  updated_at: string;
}
