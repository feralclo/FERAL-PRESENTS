/**
 * Event-type templates — the "What kind?" answer at the Start moment seeds
 * tickets and page defaults so a brand-new event lands in the editor with
 * believable content, not an empty grid.
 *
 * Phase 2.3 of EVENT-BUILDER-PLAN. Picked client-side, expanded server-side
 * by POST /api/events when a `template` field is present.
 *
 * Pricing is a sensible placeholder, not a recommendation — hosts adjust
 * immediately. The point is to skip empty-state, not dictate price points.
 *
 * Group / sequential-release wiring lives in the Tickets tab settings JSONB
 * and is not written by templates today. Festival's three tiers ship plain;
 * a host who wants the Day 1 → Day 2 → Weekend waterfall flips the group
 * mode in one click. Wiring sequential-on-create would require a follow-up
 * settings write per event; we'll layer that on if telemetry shows festival
 * hosts always toggling it.
 */

export type EventTemplateKey =
  | "concert"
  | "club"
  | "festival"
  | "conference"
  | "private";

export interface TicketTypeSeed {
  name: string;
  description?: string;
  price: number;
  capacity?: number;
  sort_order?: number;
  tier?: string;
  min_per_order?: number;
  max_per_order?: number;
}

export interface EventTemplate {
  key: EventTemplateKey;
  label: string;
  blurb: string;
  /** Lucide-react icon name. Picker maps this to the actual component. */
  icon: "Music" | "Disc3" | "Tent" | "Mic" | "Lock";
  /** When true, the editor's lineup section is shown by default. */
  show_lineup: boolean;
  /** Default visibility on creation. */
  default_visibility: "public" | "private" | "unlisted";
  ticket_types: TicketTypeSeed[];
  /** Cover-image generation hint for Phase 2.4 — affects the OG layout. */
  recommended_cover_aspect: "square" | "portrait" | "landscape";
}

export const EVENT_TEMPLATES: Record<EventTemplateKey, EventTemplate> = {
  concert: {
    key: "concert",
    label: "Concert",
    blurb: "Live music, one or two tiers.",
    icon: "Music",
    show_lineup: true,
    default_visibility: "public",
    ticket_types: [
      { name: "General admission", price: 25, sort_order: 0, tier: "standard" },
      {
        name: "VIP",
        description: "Best view, early entry.",
        price: 60,
        sort_order: 1,
        tier: "vip",
      },
    ],
    recommended_cover_aspect: "portrait",
  },
  club: {
    key: "club",
    label: "Club night",
    blurb: "Late-night, three-tier waterfall.",
    icon: "Disc3",
    show_lineup: true,
    default_visibility: "public",
    ticket_types: [
      { name: "Early bird", price: 10, capacity: 100, sort_order: 0, tier: "early" },
      { name: "General", price: 15, sort_order: 1, tier: "standard" },
      { name: "Door", price: 20, sort_order: 2, tier: "door" },
    ],
    recommended_cover_aspect: "square",
  },
  festival: {
    key: "festival",
    label: "Festival",
    blurb: "Multi-day, day passes plus a weekend.",
    icon: "Tent",
    show_lineup: true,
    default_visibility: "public",
    ticket_types: [
      { name: "Day 1", price: 45, sort_order: 0, tier: "day" },
      { name: "Day 2", price: 45, sort_order: 1, tier: "day" },
      {
        name: "Weekend",
        description: "Both days. Best value.",
        price: 80,
        sort_order: 2,
        tier: "weekend",
      },
    ],
    recommended_cover_aspect: "landscape",
  },
  conference: {
    key: "conference",
    label: "Conference",
    blurb: "Daytime, early-bird and group rates.",
    icon: "Mic",
    show_lineup: false,
    default_visibility: "public",
    ticket_types: [
      { name: "Early bird", price: 99, capacity: 150, sort_order: 0, tier: "early" },
      { name: "Standard", price: 149, sort_order: 1, tier: "standard" },
      {
        name: "Group of 5",
        description: "5 attendees per ticket — adjust min/max in the editor.",
        price: 599,
        sort_order: 2,
        tier: "group",
      },
    ],
    recommended_cover_aspect: "landscape",
  },
  private: {
    key: "private",
    label: "Private",
    blurb: "Invite-only, secret link.",
    icon: "Lock",
    show_lineup: false,
    default_visibility: "private",
    ticket_types: [
      { name: "Entry", price: 0, sort_order: 0, tier: "standard" },
    ],
    recommended_cover_aspect: "square",
  },
};

export const EVENT_TEMPLATE_KEYS = Object.keys(EVENT_TEMPLATES) as EventTemplateKey[];

export const EVENT_TEMPLATE_LIST: EventTemplate[] = EVENT_TEMPLATE_KEYS.map(
  (k) => EVENT_TEMPLATES[k]
);

export function getEventTemplate(
  key: string | undefined | null
): EventTemplate | null {
  if (!key) return null;
  return EVENT_TEMPLATES[key as EventTemplateKey] ?? null;
}

export function isEventTemplateKey(value: unknown): value is EventTemplateKey {
  return typeof value === "string" && value in EVENT_TEMPLATES;
}
