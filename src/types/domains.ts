/**
 * Domain records stored in the `domains` table.
 * Each org gets a default subdomain ({org_id}.entry.events) and can add custom domains.
 */
export interface Domain {
  id: string;
  org_id: string;
  hostname: string;
  is_primary: boolean;
  type: "subdomain" | "custom";
  status: "pending" | "active" | "failed" | "removing";
  verification_type?: string;
  verification_domain?: string;
  verification_value?: string;
  verification_reason?: string;
  created_at: string;
  updated_at: string;
}
