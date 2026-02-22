export interface OrgUser {
  id: string;
  org_id: string;
  auth_user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  role: "owner" | "member";
  perm_events: boolean;
  perm_orders: boolean;
  perm_marketing: boolean;
  perm_finance: boolean;
  status: "invited" | "active" | "suspended";
  invite_token: string | null;
  invite_expires_at: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgUserPermissions {
  perm_events: boolean;
  perm_orders: boolean;
  perm_marketing: boolean;
  perm_finance: boolean;
}
