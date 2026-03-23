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
