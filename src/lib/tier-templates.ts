/**
 * Tier templates — reusable release patterns a host can apply *inside* an
 * existing event. Distinct from the event templates in `lib/event-templates.ts`,
 * which seed a brand-new event's overall shape:
 *
 *   - Event templates answer "what kind of event is this?" → seed lineup
 *     visibility, default cover aspect, default visibility, and an initial
 *     ticket set.
 *   - Tier templates answer "how should tickets unlock?" → append a fully
 *     configured set of ticket tiers + (optionally) a group + sequential
 *     release. Existing tickets are left alone.
 *
 * Phase 4.5 of EVENT-BUILDER-PLAN. Surfaced in the Tickets section's
 * "From template" menu under "Release patterns".
 *
 * Pricing is illustrative only — every host adjusts immediately. The
 * point is to skip empty configuration, not dictate price points.
 */

export type TierTemplateKey =
  | "early_bird_waterfall"
  | "tiered_pricing"
  | "members_public"
  | "vip_ga_door"
  | "two_phase_release";

export interface TierSeed {
  name: string;
  description?: string;
  price: number;
  /** A capacity is required for sequential templates — that's how the
   *  waterfall progresses. `undefined` means unlimited (only used by
   *  the non-sequential VIP/GA shape). */
  capacity?: number;
  min_per_order?: number;
  max_per_order?: number;
}

export interface TierTemplate {
  key: TierTemplateKey;
  label: string;
  /** One-line copy shown in the picker. */
  blurb: string;
  /** Tiers in release order. */
  tiers: TierSeed[];
  /** When set, the template creates a named group containing these tiers
   *  so the host can see them clearly bracketed in the editor. */
  group_name?: string;
  /** When "sequential", the group is set to sequential release. */
  release_mode: "all" | "sequential";
}

/**
 * The five canonical tier templates. Pick names that read like UI labels
 * out of the box — hosts rarely rename templates, so the defaults need
 * to ship presentable.
 */
export const TIER_TEMPLATES: Record<TierTemplateKey, TierTemplate> = {
  early_bird_waterfall: {
    key: "early_bird_waterfall",
    label: "Early-bird waterfall",
    blurb: "Cheap → standard → late. Each tier reveals when the prior one sells out.",
    tiers: [
      { name: "Early bird", price: 10, capacity: 100 },
      { name: "Advance", price: 15, capacity: 200 },
      { name: "Standard", price: 20, capacity: 300 },
      { name: "Late release", price: 25, capacity: 100 },
    ],
    group_name: "Tickets",
    release_mode: "sequential",
  },
  tiered_pricing: {
    key: "tiered_pricing",
    label: "Three-tier pricing",
    blurb: "Phase 1 / 2 / 3 with capacity caps. Sequential release.",
    tiers: [
      { name: "Phase 1", price: 18, capacity: 150 },
      { name: "Phase 2", price: 22, capacity: 250 },
      { name: "Phase 3", price: 28, capacity: 200 },
    ],
    group_name: "Phases",
    release_mode: "sequential",
  },
  members_public: {
    key: "members_public",
    label: "Members + Public",
    blurb: "Members-only tier sells first, then public release.",
    tiers: [
      {
        name: "Members",
        description: "Members-only access for the first wave.",
        price: 25,
        capacity: 200,
      },
      { name: "Public", price: 35, capacity: 600 },
    ],
    group_name: "Release",
    release_mode: "sequential",
  },
  vip_ga_door: {
    key: "vip_ga_door",
    label: "VIP + GA + Door",
    blurb: "Three tiers on sale at the same time. No waterfall.",
    tiers: [
      { name: "VIP", description: "Best view, early entry.", price: 60 },
      { name: "General admission", price: 25 },
      {
        name: "On the door",
        description: "Card or cash on arrival.",
        price: 30,
      },
    ],
    // Side-by-side tiers — no group, no sequential. Useful when a host
    // wants the complete VIP/GA/Door lineup but otherwise picked, say,
    // the Concert event template.
    release_mode: "all",
  },
  two_phase_release: {
    key: "two_phase_release",
    label: "Two-phase release",
    blurb: "First wave + general release. The simplest waterfall.",
    tiers: [
      { name: "First wave", price: 15, capacity: 100 },
      { name: "General release", price: 20, capacity: 300 },
    ],
    group_name: "Waves",
    release_mode: "sequential",
  },
};

export const TIER_TEMPLATE_KEYS = Object.keys(TIER_TEMPLATES) as TierTemplateKey[];

export const TIER_TEMPLATE_LIST: TierTemplate[] = TIER_TEMPLATE_KEYS.map(
  (k) => TIER_TEMPLATES[k]
);

export function getTierTemplate(key: string | undefined | null): TierTemplate | null {
  if (!key) return null;
  return TIER_TEMPLATES[key as TierTemplateKey] ?? null;
}

export function isTierTemplateKey(value: unknown): value is TierTemplateKey {
  return typeof value === "string" && value in TIER_TEMPLATES;
}
