import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { RepQuest } from "@/types/reps";
import {
  isPastQuest,
  partitionQuestsByEventDate,
  type EventDateLookup,
} from "@/lib/rep-quest-grouping";
import {
  repName,
  repInitials,
  type LeaderboardEntry,
} from "@/components/admin/reps/LeaderboardRow";
import { formatRelative } from "@/components/admin/reps/ActivityFeedItem";
import { categoryOf, dayKey } from "@/app/admin/ep/page";

// ---------------------------------------------------------------------------
// rep-quest-grouping — the Quests-tab Live-vs-Past partition. This is the
// feature the user cared most about. The helper MUST be stable under:
//   1) always-on quests (event_id null) — always "live"
//   2) missing events (event_id set but not in lookup) — treat as live (safer
//      than hiding behind "Past")
//   3) event with null/invalid date_start — treat as live
// ---------------------------------------------------------------------------

function quest(overrides: Partial<RepQuest>): RepQuest {
  return {
    id: overrides.id ?? "q1",
    org_id: "test-org",
    title: "Post a story",
    quest_type: "story_share",
    platform: "any",
    points_reward: 50,
    currency_reward: 0,
    total_completed: 0,
    status: "active",
    notify_reps: false,
    uses_sound: false,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-04-22T12:00:00Z").getTime();

describe("isPastQuest", () => {
  const events = new Map<string, EventDateLookup>([
    ["ev-past", { id: "ev-past", date_start: "2026-04-10T00:00:00Z" }],
    ["ev-future", { id: "ev-future", date_start: "2026-05-10T00:00:00Z" }],
    ["ev-today", { id: "ev-today", date_start: "2026-04-22T20:00:00Z" }],
    ["ev-no-date", { id: "ev-no-date", date_start: null }],
  ]);

  it("returns false for always-on quests (no event_id)", () => {
    expect(isPastQuest(quest({ event_id: undefined }), events, NOW)).toBe(false);
  });

  it("returns true for quests whose event is strictly before now", () => {
    expect(isPastQuest(quest({ event_id: "ev-past" }), events, NOW)).toBe(true);
  });

  it("returns false for quests whose event is still in the future", () => {
    expect(isPastQuest(quest({ event_id: "ev-future" }), events, NOW)).toBe(false);
  });

  it("returns false for events happening later today (strict < now)", () => {
    expect(isPastQuest(quest({ event_id: "ev-today" }), events, NOW)).toBe(false);
  });

  it("returns false when the event has no date_start set", () => {
    expect(isPastQuest(quest({ event_id: "ev-no-date" }), events, NOW)).toBe(false);
  });

  it("returns false when the event_id does not resolve in the lookup", () => {
    expect(isPastQuest(quest({ event_id: "ev-missing" }), events, NOW)).toBe(false);
  });
});

describe("partitionQuestsByEventDate", () => {
  const events = new Map<string, EventDateLookup>([
    ["e1", { id: "e1", date_start: "2026-04-25T00:00:00Z" }], // upcoming soon
    ["e2", { id: "e2", date_start: "2026-05-01T00:00:00Z" }], // upcoming later
    ["e3", { id: "e3", date_start: "2026-04-10T00:00:00Z" }], // past
    ["e4", { id: "e4", date_start: "2026-04-01T00:00:00Z" }], // older past
  ]);

  it("places always-on quests at the end of live, sorted by created_at desc on tie", () => {
    const quests = [
      quest({ id: "a", event_id: undefined, created_at: "2026-04-01T00:00:00Z" }),
      quest({ id: "b", event_id: undefined, created_at: "2026-04-15T00:00:00Z" }),
      quest({ id: "c", event_id: "e1" }),
    ];
    const { live, past } = partitionQuestsByEventDate(quests, events, NOW);
    expect(past).toEqual([]);
    expect(live.map((q) => q.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts live quests by event_date asc (soonest first)", () => {
    const quests = [
      quest({ id: "later", event_id: "e2" }),
      quest({ id: "soon", event_id: "e1" }),
    ];
    const { live } = partitionQuestsByEventDate(quests, events, NOW);
    expect(live.map((q) => q.id)).toEqual(["soon", "later"]);
  });

  it("sorts past quests most-recently-finished first", () => {
    const quests = [
      quest({ id: "ancient", event_id: "e4" }),
      quest({ id: "recent", event_id: "e3" }),
    ];
    const { past } = partitionQuestsByEventDate(quests, events, NOW);
    expect(past.map((q) => q.id)).toEqual(["recent", "ancient"]);
  });

  it("splits a mixed list correctly", () => {
    const quests = [
      quest({ id: "p1", event_id: "e3" }),
      quest({ id: "live1", event_id: "e1" }),
      quest({ id: "p2", event_id: "e4" }),
      quest({ id: "always", event_id: undefined }),
    ];
    const { live, past } = partitionQuestsByEventDate(quests, events, NOW);
    expect(live.map((q) => q.id)).toEqual(["live1", "always"]);
    expect(past.map((q) => q.id)).toEqual(["p1", "p2"]);
  });
});

// ---------------------------------------------------------------------------
// LeaderboardRow helpers — name + initials resolution
// ---------------------------------------------------------------------------

function rep(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    id: "r1",
    level: 1,
    total_sales: 0,
    total_revenue: 0,
    points_balance: 0,
    ...overrides,
  };
}

describe("repName", () => {
  it("prefers display_name when present", () => {
    expect(repName(rep({ display_name: "DJ Raven", first_name: "Amy" }))).toBe("DJ Raven");
  });

  it("falls back to first+last joined by space", () => {
    expect(repName(rep({ first_name: "Amy", last_name: "Chen" }))).toBe("Amy Chen");
  });

  it("trims when only one of first/last is present", () => {
    expect(repName(rep({ first_name: "Amy" }))).toBe("Amy");
    expect(repName(rep({ last_name: "Chen" }))).toBe("Chen");
  });

  it("returns 'Unnamed rep' when nothing is set", () => {
    expect(repName(rep({}))).toBe("Unnamed rep");
  });
});

describe("repInitials", () => {
  it("takes first letter of each token, up to 2", () => {
    expect(repInitials(rep({ display_name: "Amy Chen" }))).toBe("AC");
  });

  it("caps at two letters for three-word names", () => {
    expect(repInitials(rep({ display_name: "Amy Pei Chen" }))).toBe("AP");
  });

  it("uppercases", () => {
    expect(repInitials(rep({ display_name: "amy chen" }))).toBe("AC");
  });

  it("returns 'UR' for Unnamed rep fallback", () => {
    // Unnamed rep → 'UR'
    expect(repInitials(rep({}))).toBe("UR");
  });
});

// ---------------------------------------------------------------------------
// formatRelative — human-readable time deltas used in the activity feed
// ---------------------------------------------------------------------------

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'now' for times within the current minute", () => {
    expect(formatRelative("2026-04-22T11:59:30Z")).toBe("now");
  });

  it("shows minutes under an hour", () => {
    expect(formatRelative("2026-04-22T11:55:00Z")).toBe("5m");
    expect(formatRelative("2026-04-22T11:01:00Z")).toBe("59m");
  });

  it("shows hours under a day", () => {
    expect(formatRelative("2026-04-22T09:00:00Z")).toBe("3h");
  });

  it("shows days under a week", () => {
    expect(formatRelative("2026-04-20T12:00:00Z")).toBe("2d");
  });

  it("shows weeks under a month", () => {
    expect(formatRelative("2026-04-08T12:00:00Z")).toBe("2w");
  });

  it("falls back to a short date for older timestamps", () => {
    const result = formatRelative("2026-03-10T12:00:00Z");
    expect(result).toMatch(/\d+\s\w{3}/); // e.g. "10 Mar"
  });

  it("returns empty string for invalid ISO input", () => {
    expect(formatRelative("not-a-date")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// EP ledger helpers
// ---------------------------------------------------------------------------

describe("categoryOf (ledger entry → filter-pill category)", () => {
  it("maps every tenant_purchase variant to 'purchase'", () => {
    expect(categoryOf("tenant_purchase")).toBe("purchase");
    expect(categoryOf("tenant_purchase_reversal")).toBe("purchase");
  });

  it("maps quest-related entries (tenant debit, rep credit, reversals) to 'quest'", () => {
    expect(categoryOf("tenant_quest_debit")).toBe("quest");
    expect(categoryOf("tenant_quest_reversal")).toBe("quest");
    expect(categoryOf("rep_quest_credit")).toBe("quest");
    expect(categoryOf("rep_quest_reversal")).toBe("quest");
  });

  it("maps rep_shop entries to 'shop'", () => {
    expect(categoryOf("rep_shop_debit")).toBe("shop");
    expect(categoryOf("rep_shop_reversal")).toBe("shop");
  });

  it("maps tenant_payout entries to 'payout'", () => {
    expect(categoryOf("tenant_payout")).toBe("payout");
    expect(categoryOf("tenant_payout_reversal")).toBe("payout");
  });

  it("returns null for platform bonuses + unknown types (they show only under 'All')", () => {
    expect(categoryOf("platform_bonus")).toBeNull();
    expect(categoryOf("something_unknown")).toBeNull();
  });
});

describe("dayKey (ledger row → day header)", () => {
  it("produces stable day headers regardless of time within the day", () => {
    const morning = dayKey("2026-04-22T05:15:00Z");
    const evening = dayKey("2026-04-22T22:59:00Z");
    expect(morning).toBe(evening);
  });

  it("produces different headers for different calendar days", () => {
    expect(dayKey("2026-04-21T23:59:00Z")).not.toBe(dayKey("2026-04-23T00:01:00Z"));
  });

  it("formats like '22 Apr 2026' (en-GB, 2-digit/short/numeric)", () => {
    expect(dayKey("2026-04-22T12:00:00Z")).toMatch(/\b22\b/);
    expect(dayKey("2026-04-22T12:00:00Z")).toMatch(/Apr/);
    expect(dayKey("2026-04-22T12:00:00Z")).toMatch(/2026/);
  });
});
