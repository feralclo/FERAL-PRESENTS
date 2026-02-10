/** Shape of event settings stored in site_settings table (JSONB `data` column) */
export interface EventSettings {
  // Ticket IDs (WeeZTix/Eventix UUIDs)
  ticketId1?: string; // General Release
  ticketId2?: string; // VIP Ticket
  ticketId3?: string; // VIP Black + Tee

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

  // Ticket subtitles/descriptions
  ticketSubtitle1?: string;
  ticketSubtitle2?: string;
  ticketSubtitle3?: string;

  // Theme
  theme?: "minimal" | "default" | null;
  minimalBgEnabled?: boolean;
  minimalBgImage?: string;
  minimalBlurStrength?: number;
  minimalStaticStrength?: number;

  // Lineup
  lineup?: string[];

  // Cover image (non-minimal theme)
  coverImage?: string;

  // Any additional dynamic fields
  [key: string]: unknown;
}

/** Row shape from site_settings table */
export interface SiteSettingsRow {
  key: string;
  data: EventSettings;
  updated_at: string;
}
