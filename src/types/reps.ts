// ─── Rep Status ──────────────────────────────────────────────────────────────
export type RepStatus = "pending" | "active" | "suspended" | "deactivated";
export type RepGender = "male" | "female" | "non-binary" | "prefer-not-to-say";

// ─── Core Rep ────────────────────────────────────────────────────────────────
export interface Rep {
  id: string;
  org_id: string;
  auth_user_id?: string | null;
  status: RepStatus;
  email: string;
  first_name: string;
  last_name: string;
  display_name?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  date_of_birth?: string | null;
  gender?: RepGender | null;
  instagram?: string | null;
  tiktok?: string | null;
  points_balance: number;
  total_sales: number;
  total_revenue: number;
  level: number;
  invited_by?: string | null;
  invite_token?: string | null;
  onboarding_completed: boolean;
  bio?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Rep–Event Assignment ────────────────────────────────────────────────────
export interface RepEvent {
  id: string;
  org_id: string;
  rep_id: string;
  event_id: string;
  discount_id?: string | null;
  assigned_at: string;
  sales_count: number;
  revenue: number;
  // Joined
  rep?: Rep;
  event?: { id: string; name: string; slug: string; date_start?: string; status?: string };
}

// ─── Rewards ─────────────────────────────────────────────────────────────────
export type RewardType = "milestone" | "points_shop" | "manual";
export type RewardStatus = "active" | "archived";

export interface RepReward {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  reward_type: RewardType;
  points_cost?: number | null;
  product_id?: string | null;
  custom_value?: string | null;
  total_available?: number | null;
  total_claimed: number;
  status: RewardStatus;
  created_at: string;
  updated_at: string;
  // Joined
  product?: { name: string; images?: string[] } | null;
  milestones?: RepMilestone[];
}

// ─── Milestones ──────────────────────────────────────────────────────────────
export type MilestoneType = "sales_count" | "revenue" | "points";

export interface RepMilestone {
  id: string;
  org_id: string;
  reward_id: string;
  milestone_type: MilestoneType;
  threshold_value: number;
  event_id?: string | null;
  title: string;
  description?: string | null;
  sort_order: number;
  created_at: string;
  // Joined
  reward?: RepReward;
  event?: { name: string } | null;
}

// ─── Points Ledger ───────────────────────────────────────────────────────────
export type PointsSourceType =
  | "sale"
  | "quest"
  | "manual"
  | "reward_spend"
  | "revocation"
  | "refund";

export interface RepPointsLog {
  id: string;
  org_id: string;
  rep_id: string;
  points: number;
  balance_after: number;
  source_type: PointsSourceType;
  source_id?: string | null;
  description: string;
  created_at: string;
  created_by?: string | null;
}

// ─── Quests ──────────────────────────────────────────────────────────────────
export type QuestType =
  | "social_post"
  | "story_share"
  | "content_creation"
  | "custom";
export type QuestStatus = "active" | "paused" | "archived" | "draft";

export interface RepQuest {
  id: string;
  org_id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  quest_type: QuestType;
  image_url?: string | null;
  video_url?: string | null;
  points_reward: number;
  event_id?: string | null;
  max_completions?: number | null;
  max_total?: number | null;
  total_completed: number;
  starts_at?: string | null;
  expires_at?: string | null;
  status: QuestStatus;
  notify_reps: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  event?: { name: string; slug?: string } | null;
}

// ─── Quest Submissions ───────────────────────────────────────────────────────
export type SubmissionProofType = "screenshot" | "url" | "text";
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface RepQuestSubmission {
  id: string;
  org_id: string;
  quest_id: string;
  rep_id: string;
  proof_type: SubmissionProofType;
  proof_url?: string | null;
  proof_text?: string | null;
  status: SubmissionStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  points_awarded: number;
  created_at: string;
  // Joined
  quest?: RepQuest;
  rep?: Rep;
}

// ─── Reward Claims ───────────────────────────────────────────────────────────
export type ClaimType = "milestone" | "points_shop" | "manual";
export type ClaimStatus = "claimed" | "fulfilled" | "cancelled";

export interface RepRewardClaim {
  id: string;
  org_id: string;
  rep_id: string;
  reward_id: string;
  claim_type: ClaimType;
  milestone_id?: string | null;
  points_spent: number;
  status: ClaimStatus;
  fulfilled_at?: string | null;
  fulfilled_by?: string | null;
  notes?: string | null;
  created_at: string;
  // Joined
  reward?: RepReward;
  rep?: Rep;
  milestone?: RepMilestone;
}

// ─── Program Settings ────────────────────────────────────────────────────────
export interface RepProgramSettings {
  /** Whether the rep program is enabled for this org */
  enabled: boolean;
  /** Points awarded per sale (per ticket sold) */
  points_per_sale: number;
  /** Whether to auto-approve applicants */
  auto_approve: boolean;
  /** Default discount percentage for new rep codes */
  default_discount_percent: number;
  /** Default discount type for new rep codes */
  default_discount_type: "percentage" | "fixed";
  /** Level thresholds: [L2, L3, L4, ...] — L1 starts at 0 */
  level_thresholds: number[];
  /** Level names (optional, indexed by level-1) */
  level_names: string[];
  /** Whether reps can see the full leaderboard */
  leaderboard_visible: boolean;
  /** Maximum number of events a rep can be assigned to */
  max_events_per_rep?: number | null;
  /** Welcome message shown on signup */
  welcome_message?: string | null;
  /** Email sender name for rep emails */
  email_from_name: string;
  /** Email sender address for rep emails */
  email_from_address: string;
}

export const DEFAULT_REP_PROGRAM_SETTINGS: RepProgramSettings = {
  enabled: true,
  points_per_sale: 10,
  auto_approve: false,
  default_discount_percent: 10,
  default_discount_type: "percentage",
  level_thresholds: [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000],
  level_names: [
    "Rookie",
    "Starter",
    "Rising",
    "Proven",
    "Veteran",
    "Elite",
    "Champion",
    "Legend",
    "Icon",
    "Mythic",
  ],
  leaderboard_visible: true,
  max_events_per_rep: null,
  welcome_message: null,
  email_from_name: "Entry Reps",
  email_from_address: "reps@feralpresents.com",
};

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export interface RepDashboardStats {
  points_balance: number;
  total_sales: number;
  total_revenue: number;
  level: number;
  level_name: string;
  next_level_points: number | null;
  current_level_points: number;
  active_quests: number;
  pending_rewards: number;
  leaderboard_position: number | null;
}

export interface RepProgramStats {
  total_reps: number;
  active_reps: number;
  pending_applications: number;
  total_sales_via_reps: number;
  total_revenue_via_reps: number;
  active_quests: number;
  pending_submissions: number;
}
