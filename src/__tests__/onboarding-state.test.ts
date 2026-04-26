import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveStateKey,
  readWizardState,
  patchWizardSection,
  migrateWizardStateToOrg,
} from "@/lib/onboarding-state";
import type { OnboardingWizardState } from "@/types/settings";

// ---------------------------------------------------------------------------
// In-memory site_settings store with chainable mock
// ---------------------------------------------------------------------------

interface Row {
  key: string;
  data: unknown;
  org_id?: string | null;
  updated_at?: string;
}

const store = new Map<string, Row>();

function makeFromChain() {
  let filterKey: string | null = null;

  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((col: string, val: string) => {
      if (col === "key") filterKey = val;
      return chain;
    }),
    maybeSingle: vi.fn().mockImplementation(async () => {
      if (filterKey == null) return { data: null };
      const row = store.get(filterKey);
      return { data: row ? { data: row.data } : null };
    }),
    upsert: vi.fn().mockImplementation(async (row: Row) => {
      store.set(row.key, row);
      return { error: null };
    }),
    delete: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockImplementation(async (col: string, val: string) => {
        if (col === "key") store.delete(val);
        return { error: null };
      }),
    })),
  };

  return chain;
}

const mockClient = {
  from: vi.fn().mockImplementation(() => makeFromChain()),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockImplementation(async () => mockClient),
}));

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// resolveStateKey
// ---------------------------------------------------------------------------

describe("resolveStateKey", () => {
  it("returns platform-scoped key when no orgId", () => {
    const result = resolveStateKey({ authUserId: "user-abc" });
    expect(result.key).toBe("wizard_state_user-abc");
    expect(result.isOrgScoped).toBe(false);
  });

  it("returns org-scoped key when orgId provided", () => {
    const result = resolveStateKey({ authUserId: "user-abc", orgId: "feral" });
    expect(result.key).toBe("feral_onboarding");
    expect(result.isOrgScoped).toBe(true);
  });

  it("returns platform-scoped key when orgId is null/undefined", () => {
    expect(resolveStateKey({ authUserId: "u", orgId: null }).isOrgScoped).toBe(false);
    expect(resolveStateKey({ authUserId: "u", orgId: undefined }).isOrgScoped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readWizardState
// ---------------------------------------------------------------------------

describe("readWizardState", () => {
  it("returns empty state when nothing stored", async () => {
    const state = await readWizardState({ authUserId: "u1" });
    expect(state).toEqual({ sections: {} });
  });

  it("reads from platform key when no orgId", async () => {
    store.set("wizard_state_u1", {
      key: "wizard_state_u1",
      data: { sections: { identity: { completed_at: "2026-04-26T00:00:00Z" } } },
    });

    const state = await readWizardState({ authUserId: "u1" });
    expect(state.sections.identity?.completed_at).toBe("2026-04-26T00:00:00Z");
  });

  it("reads from org key when orgId provided", async () => {
    store.set("acme_onboarding", {
      key: "acme_onboarding",
      data: { sections: { branding: { skipped: true } } },
    });

    const state = await readWizardState({ authUserId: "u1", orgId: "acme" });
    expect(state.sections.branding?.skipped).toBe(true);
  });

  it("defends against malformed data shapes (missing sections key)", async () => {
    store.set("wizard_state_u1", {
      key: "wizard_state_u1",
      data: { last_section: "identity" }, // no sections field
    });

    const state = await readWizardState({ authUserId: "u1" });
    expect(state.sections).toEqual({});
    expect(state.last_section).toBe("identity");
  });
});

// ---------------------------------------------------------------------------
// patchWizardSection
// ---------------------------------------------------------------------------

describe("patchWizardSection", () => {
  it("creates initial state on first patch", async () => {
    const next = await patchWizardSection({
      authUserId: "u1",
      section: "identity",
      data: { first_name: "Harry" },
    });

    expect(next.started_at).toBeDefined();
    expect(next.last_section).toBe("identity");
    expect(next.sections.identity?.visited_at).toBeDefined();
    expect(next.sections.identity?.data).toEqual({ first_name: "Harry" });
    expect(next.sections.identity?.completed_at).toBeUndefined();
  });

  it("merges section data instead of replacing it", async () => {
    await patchWizardSection({
      authUserId: "u1",
      section: "identity",
      data: { first_name: "Harry" },
    });
    const next = await patchWizardSection({
      authUserId: "u1",
      section: "identity",
      data: { last_name: "Gordon" },
    });

    expect(next.sections.identity?.data).toEqual({
      first_name: "Harry",
      last_name: "Gordon",
    });
  });

  it("preserves visited_at across multiple patches", async () => {
    const first = await patchWizardSection({
      authUserId: "u1",
      section: "identity",
      data: { name: "a" },
    });
    const firstVisited = first.sections.identity?.visited_at;

    // Wait a tick
    await new Promise((r) => setTimeout(r, 5));

    const second = await patchWizardSection({
      authUserId: "u1",
      section: "identity",
      data: { name: "b" },
    });

    expect(second.sections.identity?.visited_at).toBe(firstVisited);
  });

  it("sets completed_at when complete: true", async () => {
    const next = await patchWizardSection({
      authUserId: "u1",
      section: "country",
      data: { country: "GB" },
      complete: true,
    });

    expect(next.sections.country?.completed_at).toBeDefined();
    expect(next.sections.country?.skipped).toBe(false);
  });

  it("sets skipped: true when skip: true and clears completed_at", async () => {
    await patchWizardSection({
      authUserId: "u1",
      section: "team",
      complete: true,
    });
    const next = await patchWizardSection({
      authUserId: "u1",
      section: "team",
      skip: true,
    });

    expect(next.sections.team?.skipped).toBe(true);
    expect(next.sections.team?.completed_at).toBeUndefined();
  });

  it("updates last_section to the section being patched", async () => {
    let s = await patchWizardSection({ authUserId: "u1", section: "identity" });
    expect(s.last_section).toBe("identity");
    s = await patchWizardSection({ authUserId: "u1", section: "branding" });
    expect(s.last_section).toBe("branding");
  });

  it("writes to org key when orgId provided", async () => {
    await patchWizardSection({
      authUserId: "u1",
      orgId: "acme",
      section: "vat",
      data: { rate: 19 },
    });

    expect(store.has("acme_onboarding")).toBe(true);
    expect(store.has("wizard_state_u1")).toBe(false);
  });

  it("persists extras at the top level", async () => {
    const next = await patchWizardSection({
      authUserId: "u1",
      section: "identity",
      extras: { event_types: ["club-nights"], experience_level: "first-event" },
    });

    expect(next.event_types).toEqual(["club-nights"]);
    expect(next.experience_level).toBe("first-event");
  });
});

// ---------------------------------------------------------------------------
// migrateWizardStateToOrg
// ---------------------------------------------------------------------------

describe("migrateWizardStateToOrg", () => {
  it("copies platform state to org key and deletes the platform row", async () => {
    const platformState: OnboardingWizardState = {
      sections: { identity: { completed_at: "x" }, country: { skipped: true } },
      last_section: "country",
    };
    store.set("wizard_state_u1", { key: "wizard_state_u1", data: platformState });

    await migrateWizardStateToOrg({ authUserId: "u1", orgId: "acme" });

    expect(store.has("wizard_state_u1")).toBe(false);
    const orgRow = store.get("acme_onboarding");
    expect(orgRow).toBeDefined();
    expect((orgRow!.data as OnboardingWizardState).sections.identity?.completed_at).toBe("x");
    expect(orgRow!.org_id).toBe("acme");
  });

  it("is a no-op if no platform state exists", async () => {
    await migrateWizardStateToOrg({ authUserId: "u1", orgId: "acme" });
    expect(store.has("acme_onboarding")).toBe(false);
  });

  it("merges into existing org row when both exist (idempotent)", async () => {
    store.set("acme_onboarding", {
      key: "acme_onboarding",
      data: {
        sections: { vat: { completed_at: "v" } },
      } as OnboardingWizardState,
    });
    store.set("wizard_state_u1", {
      key: "wizard_state_u1",
      data: {
        sections: { identity: { completed_at: "i" } },
      } as OnboardingWizardState,
    });

    await migrateWizardStateToOrg({ authUserId: "u1", orgId: "acme" });

    const merged = store.get("acme_onboarding")!.data as OnboardingWizardState;
    expect(merged.sections.identity?.completed_at).toBe("i");
    expect(merged.sections.vat?.completed_at).toBe("v");
  });
});
