import type {
  QuestType,
  QuestPlatform,
  QuestProofType,
  QuestStatus,
} from "@/types/reps";

/**
 * The 3 visual quest types shown in the picker. The DB still stores
 * the 5 underlying values on `quest_type` — this enum just collapses
 * them at the UI layer.
 *
 * - `post_on_social` → social_post / story_share / content_creation
 *   (the sub-toggle in the form picks which)
 * - `sales_target`   → sales_milestone
 * - `something_else` → custom
 */
export type QuestKind = "post_on_social" | "sales_target" | "something_else";

/** Sub-toggle for `post_on_social` — picks which underlying quest_type. */
export type SocialSubType = "story" | "feed" | "make_your_own";

/** Single-asset upload OR pool of assets pulled from a campaign. */
export type AssetMode = "single" | "pool";

/**
 * Form state for the redesigned quest editor. One flat object so
 * sections can be wired with a small `Pick<>` slice + a single
 * `onChange(patch)` callback.
 *
 * Mirrors the columns on `rep_quests` plus a couple of UI-only
 * fields (the social sub-toggle, the asset_url for single mode).
 * The editor maps this to the API payload at submit time.
 */
export interface QuestFormState {
  // ─── Core (always visible) ───────────────────────────────────────
  title: string;
  /** The 3-tile picker selection. */
  kind: QuestKind | null;
  /** Sub-toggle when kind === "post_on_social". */
  socialSubType: SocialSubType;

  // ─── Reward (always visible) ─────────────────────────────────────
  /** XP — prefilled from PlatformXPConfig per quest_type. */
  xp_reward: number;
  /** EP — defaults to 0; tenant opts in. */
  ep_reward: number;

  // ─── Optional (chips) ────────────────────────────────────────────
  /** Cover image (3:4 hero on the rep card). Mux-Sharp-pipeline url. */
  cover_image_url: string | null;

  /** Single asset upload OR pool of assets. */
  asset_mode: AssetMode;
  /** Single-asset url when asset_mode === "single". */
  asset_url: string | null;
  /** Pool campaign slug when asset_mode === "pool". */
  asset_campaign_tag: string | null;

  /** Mux playback id for the optional walkthrough screen recording. */
  walkthrough_video_url: string | null;

  /** Platform (TikTok / Instagram / Either). */
  platform: QuestPlatform;
  /** Reference URL the rep should mimic / use as a starting point. */
  reference_url: string | null;
  /** TikTok-only: tells the rep to use a specific sound. */
  uses_sound: boolean;

  /** Event anchor — drives share_url + event filtering on the iOS feed. */
  event_id: string | null;

  /** How reps prove completion. */
  proof_type: QuestProofType;

  /** Per-rep cap (default 1). null = unlimited. */
  max_completions: number | null;
  /** Optional global expiry. */
  expires_at: string | null;
  /** Bypass manual review. */
  auto_approve: boolean;

  // ─── Sales-milestone-specific ────────────────────────────────────
  /** Required when kind === "sales_target". */
  sales_target: number | null;

  // ─── Secondary metadata ──────────────────────────────────────────
  subtitle: string | null;
  description: string | null;

  // ─── Lifecycle ───────────────────────────────────────────────────
  /** Status is implicit in the UI: Save = "draft", Publish = "active".
   *  Stored here for editing existing quests. */
  status: QuestStatus;
}

/**
 * Map a 5-value DB `quest_type` to a 3-value UI `QuestKind`.
 * The inverse (`questTypeFor()`) lives below — symmetric pair.
 */
export function questKindFor(questType: QuestType): QuestKind {
  switch (questType) {
    case "social_post":
    case "story_share":
    case "content_creation":
      return "post_on_social";
    case "sales_milestone":
      return "sales_target";
    case "custom":
      return "something_else";
  }
}

/**
 * Map a 3-value `QuestKind` (+ sub-toggle) back to a DB `quest_type`.
 * Called at form submit; never on render.
 */
export function questTypeFor(
  kind: QuestKind,
  socialSubType: SocialSubType
): QuestType {
  if (kind === "sales_target") return "sales_milestone";
  if (kind === "something_else") return "custom";
  // kind === "post_on_social"
  switch (socialSubType) {
    case "story":
      return "story_share";
    case "feed":
      return "social_post";
    case "make_your_own":
      return "content_creation";
  }
}

/**
 * Map a DB `quest_type` to a UI sub-toggle. Used when editing an
 * existing post-on-social quest so the right segmented control is selected.
 */
export function socialSubTypeFor(questType: QuestType): SocialSubType {
  switch (questType) {
    case "story_share":
      return "story";
    case "social_post":
      return "feed";
    case "content_creation":
      return "make_your_own";
    default:
      // sales_milestone / custom — default doesn't render the toggle
      return "story";
  }
}

/** Empty form state for the create flow. */
export const EMPTY_QUEST_FORM_STATE: QuestFormState = {
  title: "",
  kind: null,
  socialSubType: "story",
  xp_reward: 0,
  ep_reward: 0,
  cover_image_url: null,
  asset_mode: "single",
  asset_url: null,
  asset_campaign_tag: null,
  walkthrough_video_url: null,
  platform: "any",
  reference_url: null,
  uses_sound: false,
  event_id: null,
  proof_type: "screenshot",
  max_completions: 1,
  expires_at: null,
  auto_approve: false,
  sales_target: null,
  subtitle: null,
  description: null,
  status: "draft",
};

/**
 * The standard chip props consumed by every optional section. Sections
 * receive their state slice + an `onChange` patcher; they don't manage
 * their own open/closed state — that lives in `QuestForm`.
 */
export interface SectionProps {
  state: QuestFormState;
  onChange: (patch: Partial<QuestFormState>) => void;
}
