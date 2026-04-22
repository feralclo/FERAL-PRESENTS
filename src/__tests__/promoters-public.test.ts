import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRateLimiter = vi.fn().mockReturnValue(null);
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => mockRateLimiter,
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

const mockGetUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return {
    ...actual,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function makeQueryChain(result: { data: unknown; count?: number | null; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.ilike = stub;
  chain.in = stub;
  chain.gte = stub;
  chain.or = stub;
  chain.order = stub;
  chain.range = stub;
  chain.limit = stub;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return { catch: () => {} };
  };
  return chain;
}

// ---------------------------------------------------------------------------
// /api/promoters/discover
// ---------------------------------------------------------------------------

describe("GET /api/promoters/discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockRateLimiter.mockReturnValue(null);
  });

  it("returns list of public promoters", async () => {
    mockFrom.mockImplementation(() =>
      makeQueryChain({
        data: [
          {
            id: "p1",
            handle: "feral",
            display_name: "FERAL",
            tagline: null,
            location: null,
            accent_hex: 0,
            avatar_url: null,
            avatar_initials: "F",
            avatar_bg_hex: null,
            cover_image_url: null,
            follower_count: 10,
            team_size: 5,
          },
        ],
        count: 1,
      })
    );
    const { GET } = await import("@/app/api/promoters/discover/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/promoters/discover")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].handle).toBe("feral");
    expect(json.pagination.total).toBe(1);
    expect(json.pagination.has_more).toBe(false);
  });

  it("respects limit/offset bounds", async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: [], count: 0 }));
    const { GET } = await import("@/app/api/promoters/discover/route");
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/promoters/discover?limit=999&offset=-5"
      )
    );
    const json = await res.json();
    expect(json.pagination.limit).toBe(50);
    expect(json.pagination.offset).toBe(0);
  });

  it("returns rate-limit response when blocked", async () => {
    mockRateLimiter.mockReturnValueOnce(
      NextResponse.json({ error: "rate_limited" }, { status: 429 })
    );
    const { GET } = await import("@/app/api/promoters/discover/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/promoters/discover")
    );
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// /api/promoters/[handle]
// ---------------------------------------------------------------------------

describe("GET /api/promoters/[handle]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockGetUser.mockReset();
  });

  it("returns 404 for unknown handle", async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: null }));
    const { GET } = await import("@/app/api/promoters/[handle]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/promoters/nope"),
      { params: Promise.resolve({ handle: "nope" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns promoter profile with null viewer-state when unauthed", async () => {
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      call += 1;
      if (table === "promoters") {
        return makeQueryChain({
          data: {
            id: "p1",
            org_id: "feral",
            handle: "feral",
            display_name: "FERAL",
            tagline: null,
            bio: null,
            location: null,
            accent_hex: 0,
            avatar_url: null,
            avatar_initials: "F",
            avatar_bg_hex: null,
            cover_image_url: null,
            website: null,
            instagram: null,
            tiktok: null,
            follower_count: 10,
            team_size: 5,
            visibility: "public",
          },
        });
      }
      if (table === "events") {
        return makeQueryChain({ data: [], count: 0 });
      }
      return makeQueryChain({ data: null });
    });

    const { GET } = await import("@/app/api/promoters/[handle]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/promoters/feral"),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.handle).toBe("feral");
    expect(json.data.is_following).toBeNull();
    expect(json.data.is_on_team).toBeNull();
    expect(json.data.membership_status).toBeNull();
    expect(json.data.featured_events).toEqual([]);
    expect(call).toBeGreaterThanOrEqual(2); // promoter + events at minimum
  });

  it("populates viewer state from Bearer token", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: {
            id: "p1",
            org_id: "feral",
            handle: "feral",
            display_name: "FERAL",
            tagline: null,
            bio: null,
            location: null,
            accent_hex: 0,
            avatar_url: null,
            avatar_initials: "F",
            avatar_bg_hex: null,
            cover_image_url: null,
            website: null,
            instagram: null,
            tiktok: null,
            follower_count: 10,
            team_size: 5,
            visibility: "public",
          },
        });
      }
      if (table === "reps") {
        return makeQueryChain({
          data: { id: "rep-1", status: "active" },
        });
      }
      if (table === "rep_promoter_follows") {
        return makeQueryChain({ data: { promoter_id: "p1" } });
      }
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({ data: { status: "approved" } });
      }
      if (table === "events") {
        return makeQueryChain({ data: [], count: 0 });
      }
      return makeQueryChain({ data: null });
    });

    const req = new NextRequest("http://localhost:3000/api/promoters/feral", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const { GET } = await import("@/app/api/promoters/[handle]/route");
    const res = await GET(req, {
      params: Promise.resolve({ handle: "feral" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.is_following).toBe(true);
    expect(json.data.is_on_team).toBe(true);
    expect(json.data.membership_status).toBe("approved");
  });

  it("returns 404 for private promoter when viewer is not on the team", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: {
            id: "p1",
            org_id: "hidden",
            handle: "hidden",
            display_name: "Hidden Org",
            tagline: null,
            bio: null,
            location: null,
            accent_hex: 0,
            avatar_url: null,
            avatar_initials: "H",
            avatar_bg_hex: null,
            cover_image_url: null,
            website: null,
            instagram: null,
            tiktok: null,
            follower_count: 0,
            team_size: 0,
            visibility: "private",
          },
        });
      }
      return makeQueryChain({ data: null });
    });
    const { GET } = await import("@/app/api/promoters/[handle]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/promoters/hidden"),
      { params: Promise.resolve({ handle: "hidden" }) }
    );
    expect(res.status).toBe(404);
  });

  it("strips leading @ from handle in URL", async () => {
    // ilike() is used for case-insensitive lookup — the handle with @ should
    // be normalised before the lookup. Confirm no 404 when URL has "@feral".
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: {
            id: "p1",
            org_id: "feral",
            handle: "feral",
            display_name: "FERAL",
            tagline: null,
            bio: null,
            location: null,
            accent_hex: 0,
            avatar_url: null,
            avatar_initials: "F",
            avatar_bg_hex: null,
            cover_image_url: null,
            website: null,
            instagram: null,
            tiktok: null,
            follower_count: 10,
            team_size: 5,
            visibility: "public",
          },
        });
      }
      if (table === "events") return makeQueryChain({ data: [], count: 0 });
      return makeQueryChain({ data: null });
    });
    const { GET } = await import("@/app/api/promoters/[handle]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/promoters/@feral"),
      { params: Promise.resolve({ handle: "@feral" }) }
    );
    expect(res.status).toBe(200);
  });
});
