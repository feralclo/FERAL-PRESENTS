import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireRepAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRepAuth: (opts?: unknown) => mockRequireRepAuth(opts),
}));

vi.mock("@/lib/rep-points", () => ({
  getPlatformXPConfig: vi.fn().mockResolvedValue({
    leveling: { base_xp: 100, exponent: 1.5, max_level: 50 },
    tiers: [
      { name: "Rookie", min_level: 1, color: "#94A3B8" },
      { name: "Rising", min_level: 5, color: "#38BDF8" },
    ],
  }),
}));

// Small helper to build a chainable mock that returns a given result at the end
function makeQueryChain(result: { data: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.in = stub;
  chain.gte = stub;
  chain.lte = stub;
  chain.maybeSingle = () => Promise.resolve(result);
  chain.order = stub;
  chain.limit = stub;
  chain.is = stub;
  chain.single = () => Promise.resolve(result);
  // Promise-like behaviour for chains that don't end in .single()
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return { catch: () => {} };
  };
  return chain;
}

const tableFixtures: Record<string, { data: unknown; count?: number | null }> = {};
const mockFrom = vi.fn((table: string) =>
  makeQueryChain(tableFixtures[table] ?? { data: [] })
);

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authOK(overrides?: Partial<{ id: string; status: string }>) {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: {
      id: "rep-1",
      auth_user_id: "auth-user-1",
      email: "maya@feral.com",
      org_id: "feral",
      status: "active",
      ...overrides,
    },
    error: null,
  });
}

function authFail(status = 401) {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: null,
    error: NextResponse.json({ error: "unauthorized" }, { status }),
  });
}

function buildRequest(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/rep-portal/dashboard${qs ? `?${qs}` : ""}`
  );
}

function seedFixtures({
  rep,
  memberships,
  follows,
  events,
  repEvents,
  quests,
  submissions,
  leaderboard,
  recentSales,
  orderItems,
  pointsToday,
}: {
  rep: Record<string, unknown> | null;
  memberships?: unknown[];
  follows?: unknown[];
  events?: unknown[];
  repEvents?: unknown[];
  quests?: unknown[];
  submissions?: unknown[];
  leaderboard?: unknown[];
  recentSales?: unknown[];
  orderItems?: unknown[];
  pointsToday?: unknown[];
}) {
  tableFixtures["reps"] = { data: rep, count: leaderboard?.length ?? 0 };
  tableFixtures["rep_promoter_memberships"] = { data: memberships ?? [] };
  tableFixtures["rep_promoter_follows"] = { data: follows ?? [] };
  tableFixtures["events"] = { data: events ?? [] };
  tableFixtures["rep_events"] = { data: repEvents ?? [] };
  tableFixtures["rep_quests"] = { data: quests ?? [] };
  tableFixtures["rep_quest_submissions"] = { data: submissions ?? [] };
  tableFixtures["orders"] = { data: recentSales ?? [] };
  tableFixtures["order_items"] = { data: orderItems ?? [] };
  tableFixtures["rep_points_log"] = { data: pointsToday ?? [], count: null };

  // reps table is hit twice: once for the full row (.single() returns data),
  // once for the leaderboard (no .single(), returns array). Special-case:
  // when `.single` is called we return the rep row object; otherwise the
  // leaderboard array.
  mockFrom.mockImplementation((table: string) => {
    if (table === "reps") {
      const chain: Record<string, unknown> = {};
      const stub = () => chain;
      chain.select = stub;
      chain.eq = stub;
      chain.in = stub;
      chain.order = stub;
      chain.limit = stub;
      chain.single = () => Promise.resolve({ data: rep, error: null });
      (chain as { then?: unknown }).then = (
        resolve: (v: unknown) => void
      ) => {
        resolve({ data: leaderboard ?? [], count: leaderboard?.length ?? 0 });
        return { catch: () => {} };
      };
      return chain;
    }
    return makeQueryChain(tableFixtures[table] ?? { data: [] });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/rep-portal/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    Object.keys(tableFixtures).forEach((k) => delete tableFixtures[k]);
  });

  it("returns 401 when not authenticated", async () => {
    authFail(401);
    const { GET } = await import("@/app/api/rep-portal/dashboard/route");
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the rep row cannot be found", async () => {
    authOK();
    seedFixtures({ rep: null });
    const { GET } = await import("@/app/api/rep-portal/dashboard/route");
    const res = await GET(buildRequest());
    expect(res.status).toBe(404);
  });

  it("returns all sections on happy path with real membership", async () => {
    authOK();
    seedFixtures({
      rep: {
        id: "rep-1",
        email: "maya@feral.com",
        first_name: "Maya",
        display_name: "maya.ok",
        points_balance: 3420,
        currency_balance: 240,
        total_sales: 42,
        total_revenue: 840,
        level: 7,
        onboarding_completed: true,
      },
      memberships: [
        {
          promoter_id: "promoter-uuid",
          discount_code: "MAYA10",
          discount_percent: 10,
          promoter: {
            id: "promoter-uuid",
            org_id: "feral",
            handle: "feral",
            display_name: "FERAL PRESENTS",
            tagline: null,
            accent_hex: 16711680,
            avatar_url: null,
            avatar_initials: "F",
            avatar_bg_hex: null,
            cover_image_url: null,
            follower_count: 2410,
            team_size: 6,
          },
        },
      ],
      follows: [],
      events: [
        {
          id: "event-uuid",
          org_id: "feral",
          name: "FERAL vs. IWF",
          slug: "feral-vs-iwf",
          date_start: "2030-05-10T22:00:00Z",
          date_end: null,
          venue_name: "Warehouse Project",
          city: "Manchester",
          country: "GB",
          status: "published",
          cover_image: null,
          cover_image_url: "https://cdn/clean.jpg",
          poster_image_url: null,
          banner_image_url: null,
        },
      ],
      repEvents: [{ event_id: "event-uuid", sales_count: 14, revenue: 280 }],
      quests: [
        {
          id: "q1",
          event_id: "event-uuid",
          points_reward: 200,
          currency_reward: 50,
        },
      ],
      submissions: [],
      leaderboard: [
        { id: "rep-0", total_revenue: 1000 },
        { id: "rep-1", total_revenue: 840 },
      ],
      recentSales: [],
      pointsToday: [{ points_delta: 200 }],
    });

    const { GET } = await import("@/app/api/rep-portal/dashboard/route");
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.rep.id).toBe("rep-1");
    expect(json.data.rep.ep_balance).toBe(240);
    expect(json.data.rep.xp_balance).toBe(3420);
    expect(json.data.xp.today).toBe(200);
    expect(json.data.xp.balance).toBe(3420);
    expect(json.data.ep).toEqual({ balance: 240, label: "240 EP" });
    expect(json.data.leaderboard.position).toBe(2);
    expect(json.data.leaderboard.total).toBe(2);
    expect(json.data.leaderboard.in_top_10).toBe(true);
    expect(json.data.followed_promoters).toEqual([]);
    expect(json.data.events).toHaveLength(1);
    expect(json.data.events[0].promoter_handle).toBe("feral");
    expect(json.data.events[0].cover_image_url).toBe("https://cdn/clean.jpg");
    expect(json.data.events[0].quests).toEqual({
      total: 1,
      completed: 0,
      in_progress: 0,
      available: 1,
    });
    expect(json.data.events[0].xp_reward_max).toBe(200);
    expect(json.data.events[0].ep_reward_max).toBe(50);
    expect(json.data.feed).toEqual([]);
    expect(json.data.story_rail).toEqual([]);
    expect(json.data.featured_rewards).toEqual([]);
    expect(json.data.discount.primary_code).toBe("MAYA10");
    expect(json.data.discount.primary_percent).toBe(10);
    // Top-level share_url mirrors discount.primary_code applied to the
    // primary membership's tenant root. With no domains fixture seeded,
    // it falls back to NEXT_PUBLIC_SITE_URL (or the entry.events default)
    // — assert structurally rather than against a literal because the
    // CI build env sets NEXT_PUBLIC_SITE_URL to the prod host while
    // local dev leaves it unset.
    expect(json.data.share_url).toMatch(/^https:\/\/[^/]+\/\?ref=MAYA10$/);
  });

  it("?include= scopes the response to requested sections", async () => {
    authOK();
    seedFixtures({
      rep: {
        id: "rep-1",
        email: "maya@feral.com",
        points_balance: 0,
        currency_balance: 0,
        total_sales: 0,
        total_revenue: 0,
        level: 1,
      },
    });
    const { GET } = await import("@/app/api/rep-portal/dashboard/route");
    const res = await GET(buildRequest("include=rep,ep"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.rep).toBeDefined();
    expect(json.data.ep).toBeDefined();
    expect(json.data.xp).toBeUndefined();
    expect(json.data.events).toBeUndefined();
    expect(json.data.leaderboard).toBeUndefined();
    expect(json.data.recent_sales).toBeUndefined();
  });

  it("dashboard works with no approved memberships (new rep)", async () => {
    authOK();
    seedFixtures({
      rep: {
        id: "rep-1",
        email: "new@rep.com",
        points_balance: 0,
        currency_balance: 0,
        total_sales: 0,
        total_revenue: 0,
        level: 1,
      },
      memberships: [],
    });
    const { GET } = await import("@/app/api/rep-portal/dashboard/route");
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.events).toEqual([]);
    expect(json.data.recent_sales).toEqual([]);
    expect(json.data.leaderboard).toEqual({
      position: null,
      total: 0,
      delta_week: null,
      in_top_10: false,
    });
    expect(json.data.discount).toEqual({
      primary_code: null,
      primary_percent: null,
      per_promoter: [],
    });
    // No approved membership with a code → no share_url either. iOS hides
    // the share CTA when this is null rather than rendering a broken link.
    expect(json.data.share_url).toBeNull();
  });
});
