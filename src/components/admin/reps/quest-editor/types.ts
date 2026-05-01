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

/**
 * Hydrate a `QuestFormState` from an existing `RepQuest` row — the
 * inverse of `mapStateToPayload`. Used when opening the editor in
 * edit mode so all chips populate with the row's current values.
 */
import type { RepQuest } from "@/types/reps";

export function questToFormState(quest: RepQuest): QuestFormState {
  const kind = questKindFor(quest.quest_type);
  const subType = socialSubTypeFor(quest.quest_type);
  const xp = quest.xp_reward ?? quest.points_reward ?? 0;
  const ep = quest.ep_reward ?? quest.currency_reward ?? 0;
  return {
    title: quest.title ?? "",
    kind,
    socialSubType: subType,
    xp_reward: xp,
    ep_reward: ep,
    cover_image_url: quest.cover_image_url ?? null,
    asset_mode:
      (quest.asset_mode as "single" | "pool" | null | undefined) ?? "single",
    // `video_url` doubles as the single-asset shareable URL (image http URL
    // or Mux playback id). The form's `asset_url` mirrors that — see the
    // legacy editor's "iOS distinguishes by isMuxPlaybackId" comment.
    asset_url: quest.video_url ?? null,
    asset_campaign_tag: quest.asset_campaign_tag ?? null,
    walkthrough_video_url: quest.walkthrough_video_url ?? null,
    platform: quest.platform ?? "any",
    reference_url: quest.reference_url ?? null,
    uses_sound: quest.uses_sound ?? false,
    event_id: quest.event_id ?? null,
    proof_type: quest.proof_type ?? "screenshot",
    max_completions: quest.max_completions ?? null,
    expires_at: quest.expires_at ?? null,
    auto_approve: quest.auto_approve ?? false,
    sales_target: quest.sales_target ?? null,
    subtitle: quest.subtitle ?? null,
    description: quest.description ?? null,
    status: quest.status ?? "draft",
  };
}

/**
 * Map the editor's `QuestFormState` to the API payload accepted by
 * `POST /api/reps/quests` and `PUT /api/reps/quests/[id]`.
 *
 * Notes:
 * - `quest_type` is derived from `kind` + `socialSubType` via `questTypeFor`.
 * - `video_url` carries the single-asset shareable (image http URL or
 *   Mux playback id) — same column the legacy editor wrote to.
 * - `asset_campaign_tag` is only written in pool mode; cleared otherwise.
 * - `sales_target` is only written for sales_target quests.
 * - `points_reward` + `xp_reward` mirror; `currency_reward` + `ep_reward`
 *   mirror — backend accepts either name pair, but old reads still
 *   populate the legacy column.
 * - `description` and `image_url` are intentionally null — both are
 *   dead on iOS (description never rendered; image_url merged with
 *   cover server-side). Banner is event-only and never written here.
 */
export function mapStateToPayload(
  state: QuestFormState,
  status: "draft" | "active"
): Record<string, unknown> {
  if (!state.kind) {
    throw new Error("Cannot serialize a quest with no kind selected");
  }
  const questType = questTypeFor(state.kind, state.socialSubType);
  return {
    title: state.title.trim(),
    subtitle: state.subtitle?.trim() || null,
    description: null,
    quest_type: questType,
    platform: state.platform,
    proof_type: state.proof_type,
    image_url: null,
    cover_image_url: state.cover_image_url ?? null,
    banner_image_url: null,
    video_url: state.asset_url ?? null,
    walkthrough_video_url: state.walkthrough_video_url ?? null,
    points_reward: state.xp_reward,
    xp_reward: state.xp_reward,
    currency_reward: state.ep_reward,
    ep_reward: state.ep_reward,
    auto_approve: state.auto_approve,
    max_completions: state.max_completions,
    expires_at: state.expires_at,
    reference_url: state.reference_url,
    uses_sound: state.uses_sound,
    sales_target:
      state.kind === "sales_target" ? state.sales_target : null,
    event_id: state.event_id,
    asset_mode: state.asset_mode,
    asset_campaign_tag:
      state.asset_mode === "pool" ? state.asset_campaign_tag : null,
    status,
  };
}
