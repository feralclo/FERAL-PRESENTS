import type { AccessLevel } from "@/types/orders";

/** Per-access-level quotas for an artist submission link. null = unlimited. */
export interface SubmissionLinkQuotas {
  guest_list?: number | null;
  vip?: number | null;
  backstage?: number | null;
  aaa?: number | null;
  artist?: number | null;
}

/** A submission link stored in site_settings. */
export interface SubmissionLink {
  token: string;
  event_id: string;
  artist_name: string;
  created_at: string;
  active: boolean;
  quotas?: SubmissionLinkQuotas;
}

/** A submission link enriched with usage data (returned by GET API). */
export interface SubmissionLinkWithUsage extends SubmissionLink {
  url: string;
  submission_count: number;
  quota_usage: Partial<Record<AccessLevel, number>>;
  quota_remaining?: Partial<Record<AccessLevel, number | null>>;
}

// ---------------------------------------------------------------------------
// Application Campaigns
// ---------------------------------------------------------------------------

export type GuestListSource = "direct" | "artist" | "application";

/** Data stored in guest_list.application_data JSONB. */
export interface ApplicationData {
  campaign_id: string;
  instagram?: string;
  date_of_birth?: string;
}

/** An application campaign stored in site_settings. */
export interface ApplicationCampaign {
  id: string;
  event_id: string;
  title: string;
  description?: string;
  default_price: number;       // major currency units (0 = free, 5 = £5)
  currency: string;            // "GBP"
  access_level: AccessLevel;
  capacity?: number;           // max applications (null = unlimited)
  fields: {
    instagram: boolean;
    date_of_birth: boolean;
  };
  active: boolean;
  created_at: string;
}

/** A campaign enriched with usage data. */
export interface ApplicationCampaignWithUsage extends ApplicationCampaign {
  url: string;
  applied_count: number;
}
