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
  currency_balance: number;
  total_sales: number;
  total_revenue: number;
  level: number;
  invited_by?: string | null;
  invite_token?: string | null;
  onboarding_completed: boolean;
  email_verified: boolean;
  email_verification_token?: string | null;
  bio?: string | null;
  created_at: string;
  customer_id?: string | null;
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
export type FulfillmentType = "manual" | "free_ticket" | "extra_tickets" | "vip_upgrade" | "merch";

export interface RewardMetadata {
  fulfillment_type?: FulfillmentType;
  event_id?: string;
  ticket_type_id?: string;
  upgrade_to_ticket_type_id?: string;
  max_claims_per_rep?: number | null; // 0 = unlimited, default 1
}

export interface ClaimMetadata {
  order_id?: string;
  order_number?: string;
  ticket_codes?: string[];
  merch_size?: string;
  event_id?: string;
  original_ticket_type_id?: string;
}

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
  metadata?: RewardMetadata;
  created_at: string;
  updated_at: string;
  // Joined
  product?: { name: string; images?: string[]; sizes?: string[] } | null;
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
  currency_amount?: number;
  currency_balance_after?: number;
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
  | "custom"
  | "sales_milestone";
export type QuestPlatform = "tiktok" | "instagram" | "any";
export type QuestStatus = "active" | "paused" | "archived" | "draft";

export interface RepQuest {
  id: string;
  org_id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  quest_type: QuestType;
  platform: QuestPlatform;
  image_url?: string | null;
  banner_image_url?: string | null;
  video_url?: string | null;
  points_reward: number;
  currency_reward: number;
  event_id?: string | null;
  max_completions?: number | null;
  max_total?: number | null;
  total_completed: number;
  starts_at?: string | null;
  expires_at?: string | null;
  status: QuestStatus;
  notify_reps: boolean;
  reference_url?: string | null;
  uses_sound: boolean;
  sales_target?: number | null;
  created_at: string;
  updated_at: string;
  // Joined / enriched
  event?: { name: string; slug?: string } | null;
  pending_count?: number;
}

// ─── Quest Submissions ───────────────────────────────────────────────────────
export type SubmissionProofType = "screenshot" | "url" | "text" | "tiktok_link" | "instagram_link";
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
  metadata?: ClaimMetadata;
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
  /** Currency awarded per sale (per ticket sold) */
  currency_per_sale: number;
  /** Tenant-specific currency name (e.g., "FRL") */
  currency_name: string;
  /** Auto-assign all active reps to new events */
  auto_assign_events: boolean;
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
  email_from_name: "Entry",
  email_from_address: "noreply@mail.entry.events",
  currency_per_sale: 10,
  currency_name: "FRL",
  auto_assign_events: true,
};

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export interface RepDashboardStats {
  points_balance: number;
  currency_balance: number;
  currency_name: string;
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

// ─── Event Position Rewards ─────────────────────────────────────────────────
export interface RepEventPositionReward {
  id: string;
  org_id: string;
  event_id: string;
  position: number;
  reward_id?: string | null;
  reward_name: string;
  xp_reward: number;
  currency_reward: number;
  awarded_rep_id?: string | null;
  awarded_at?: string | null;
  created_at: string;
  // Joined
  reward?: RepReward | null;
  awarded_rep?: { id: string; display_name?: string; first_name: string; photo_url?: string } | null;
}

// ─── Platform XP Config ────────────────────────────────────────────────────
export interface PlatformXPConfig {
  /** XP awarded per ticket sold */
  xp_per_sale: number;
  /** XP awarded per quest type completion */
  xp_per_quest_type: {
    social_post: number;
    story_share: number;
    content_creation: number;
    custom: number;
    sales_milestone: number;
  };
  /** XP awarded by leaderboard position (key = position number) */
  position_xp: Record<number, number>;
  /** Leveling curve parameters */
  leveling: {
    base_xp: number;
    exponent: number;
    max_level: number;
  };
  /** Tier definitions — visual groupings of levels */
  tiers: {
    name: string;
    min_level: number;
    color: string;
  }[];
  /** @deprecated — generated from leveling formula for backward compat */
  level_thresholds: number[];
  /** @deprecated — generated from tiers for backward compat */
  level_names: string[];
}

export const DEFAULT_PLATFORM_XP_CONFIG: PlatformXPConfig = {
  xp_per_sale: 25,
  xp_per_quest_type: {
    social_post: 100,
    story_share: 50,
    content_creation: 150,
    custom: 75,
    sales_milestone: 200,
  },
  position_xp: { 1: 500, 2: 300, 3: 150 },
  leveling: {
    base_xp: 100,
    exponent: 1.5,
    max_level: 50,
  },
  tiers: [
    { name: "Rookie", min_level: 1, color: "#94A3B8" },
    { name: "Rising", min_level: 5, color: "#38BDF8" },
    { name: "Pro", min_level: 10, color: "#34D399" },
    { name: "Veteran", min_level: 15, color: "#8B5CF6" },
    { name: "Elite", min_level: 20, color: "#F59E0B" },
    { name: "Legend", min_level: 30, color: "#F43F5E" },
    { name: "Mythic", min_level: 40, color: "#FFD700" },
  ],
  // Backward compat — these are generated from the formula at runtime
  level_thresholds: [],
  level_names: [],
};

// ─── Notifications ──────────────────────────────────────────────────────────
export type RepNotificationType =
  | "reward_unlocked"
  | "quest_approved"
  | "sale_attributed"
  | "level_up"
  | "reward_fulfilled"
  | "manual_grant"
  | "approved"
  | "general"
  | "approved";

export interface RepNotification {
  id: string;
  org_id: string;
  rep_id: string;
  type: RepNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

// ─── Event Leaderboard (Rep Portal) ────────────────────────────────────────
export interface EventLeaderboardSummary {
  event_id: string;
  event_name: string;
  event_date: string | null;
  event_status: string;
  cover_image?: string | null;
  reps_count: number;
  your_position: number | null;
  your_sales: number;
  your_revenue: number;
  locked: boolean;
  position_rewards: {
    position: number;
    reward_name: string;
    reward_id?: string | null;
    awarded_rep_id?: string | null;
    xp_reward?: number;
    currency_reward?: number;
  }[];
}
