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

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

function makeQueryChain(result: { data: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.order = stub;
  chain.range = stub;
  chain.limit = stub;
  chain.single = () => Promise.resolve(result);
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return { catch: () => {} };
  };
  return chain;
}

function authOK() {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: { id: "rep-1", auth_user_id: "auth-1", email: "r@x.com", org_id: "feral", status: "active" },
    error: null,
  });
}

function authFail(status = 401) {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: null,
    error: NextResponse.json({ error: "unauthorized" }, { status }),
  });
}

// ---------------------------------------------------------------------------
// /me/memberships
// ---------------------------------------------------------------------------

describe("GET /api/rep-portal/me/memberships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { GET } = await import("@/app/api/rep-portal/me/memberships/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("groups memberships by status", async () => {
    authOK();
    mockFrom.mockImplementation(() =>
      makeQueryChain({
        data: [
          {
            id: "m1",
            status: "approved",
            discount_code: "CODE1",
            discount_percent: 10,
            pitch: null,
            requested_at: "2026-03-01T00:00:00Z",
            approved_at: "2026-03-02T00:00:00Z",
            left_at: null,
            rejected_reason: null,
            promoter: {
              id: "p1",
              handle: "feral",
              display_name: "FERAL",
              tagline: null,
              accent_hex: 0,
              avatar_url: null,
              avatar_initials: "F",
              avatar_bg_hex: null,
              cover_image_url: null,
              follower_count: 0,
              team_size: 1,
            },
          },
          {
            id: "m2",
            status: "pending",
            discount_code: null,
            discount_percent: null,
            pitch: "I can bring 20+",
            requested_at: "2026-04-01T00:00:00Z",
            approved_at: null,
            left_at: null,
            rejected_reason: null,
            promoter: {
              id: "p2",
              handle: "volta",
              display_name: "Voltaevents",
              tagline: null,
              accent_hex: 0,
              avatar_url: null,
              avatar_initials: "V",
              avatar_bg_hex: null,
              cover_image_url: null,
              follower_count: 0,
              team_size: 0,
            },
          },
        ],
      })
    );
    const { GET } = await import("@/app/api/rep-portal/me/memberships/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.approved).toHaveLength(1);
    expect(json.data.pending).toHaveLength(1);
    expect(json.data.rejected).toHaveLength(0);
    expect(json.data.left).toHaveLength(0);
    expect(json.data.approved[0].promoter.handle).toBe("feral");
    expect(json.data.pending[0].pitch).toBe("I can bring 20+");
  });
});

// ---------------------------------------------------------------------------
// /me/balances
// ---------------------------------------------------------------------------

describe("GET /api/rep-portal/me/balances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { GET } = await import("@/app/api/rep-portal/me/balances/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when rep row is missing", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "reps") {
        return makeQueryChain({ data: null });
      }
      return makeQueryChain({ data: [], count: 0 });
    });
    const { GET } = await import("@/app/api/rep-portal/me/balances/route");
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns xp, ep, and lifetime blocks on happy path", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "reps") {
        return makeQueryChain({
          data: {
            points_balance: 3420,
            currency_balance: 240,
            total_sales: 42,
            total_revenue: 840,
          },
        });
      }
      // rep_quest_submissions .eq.eq.select({count:..., head:true}) — it's
      // resolved via the .then thenable
      return makeQueryChain({ data: [], count: 7 });
    });
    const { GET } = await import("@/app/api/rep-portal/me/balances/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.xp.balance).toBe(3420);
    expect(json.data.xp.level).toBeGreaterThan(0);
    expect(json.data.xp.tier).toBeTypeOf("string");
    expect(json.data.ep).toEqual({ balance: 240, label: "240 EP" });
    expect(json.data.lifetime.total_sales).toBe(42);
    expect(json.data.lifetime.total_revenue_pence).toBe(84000);
    expect(json.data.lifetime.approved_quests).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// /me/following/promoters
// ---------------------------------------------------------------------------

describe("GET /api/rep-portal/me/following/promoters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { GET } = await import(
      "@/app/api/rep-portal/me/following/promoters/route"
    );
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/me/following/promoters")
    );
    expect(res.status).toBe(401);
  });

  it("returns paginated list with is_following=true and is_on_team derived from memberships", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "rep_promoter_follows") {
        return makeQueryChain({
          data: [
            {
              created_at: "2026-04-01T00:00:00Z",
              promoter: {
                id: "p1",
                handle: "feral",
                display_name: "FERAL",
                tagline: null,
                accent_hex: 0,
                avatar_url: null,
                avatar_initials: "F",
                avatar_bg_hex: null,
                cover_image_url: null,
                follower_count: 10,
                team_size: 5,
              },
            },
            {
              created_at: "2026-04-02T00:00:00Z",
              promoter: {
                id: "p2",
                handle: "volta",
                display_name: "Voltaevents",
                tagline: null,
                accent_hex: 0,
                avatar_url: null,
                avatar_initials: "V",
                avatar_bg_hex: null,
                cover_image_url: null,
                follower_count: 20,
                team_size: 3,
              },
            },
          ],
          count: 2,
        });
      }
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({
          data: [{ promoter_id: "p1" }],
        });
      }
      return makeQueryChain({ data: [] });
    });
    const { GET } = await import(
      "@/app/api/rep-portal/me/following/promoters/route"
    );
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/me/following/promoters?limit=10&offset=0")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].handle).toBe("feral");
    expect(json.data[0].is_following).toBe(true);
    expect(json.data[0].is_on_team).toBe(true);
    expect(json.data[1].is_on_team).toBe(false);
    expect(json.pagination).toEqual({
      limit: 10,
      offset: 0,
      has_more: false,
      total: 2,
    });
  });

  it("clamps limit to 50 max", async () => {
    authOK();
    mockFrom.mockImplementation(() => makeQueryChain({ data: [], count: 0 }));
    const { GET } = await import(
      "@/app/api/rep-portal/me/following/promoters/route"
    );
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/me/following/promoters?limit=999")
    );
    const json = await res.json();
    expect(json.pagination.limit).toBe(50);
  });
});
