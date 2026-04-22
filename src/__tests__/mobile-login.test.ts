import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — declared before any import that triggers the route module
// ---------------------------------------------------------------------------

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockServerClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
};

const mockFrom = vi.fn();
const mockAdminClient = { from: mockFrom };

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue(mockServerClient),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockAdminClient),
}));

vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => "feral",
}));

const mockRateLimiter = vi.fn().mockReturnValue(null);
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => mockRateLimiter,
}));

vi.mock("@/lib/rep-points", () => ({
  getRepSettings: vi.fn().mockResolvedValue({
    currency_name: "EP",
    currency_per_sale: 10,
  }),
  getPlatformXPConfig: vi.fn().mockResolvedValue({
    xp_per_sale: 50,
    xp_per_quest_type: { social_post: 100, story_share: 50 },
    leveling: { max_level: 50, base_xp: 100, growth: 1.5 },
    tiers: [{ name: "Rookie", minLevel: 1, color: "#888" }],
    level_names: ["Rookie"],
    level_thresholds: [0, 100, 250],
  }),
}));

vi.mock("@/lib/xp-levels", async () => {
  const actual = await vi.importActual<typeof import("@/lib/xp-levels")>("@/lib/xp-levels");
  return {
    ...actual,
    generateLevelTable: vi.fn().mockReturnValue(
      Array.from({ length: 50 }, (_, i) => ({
        level: i + 1,
        totalXp: i * 100,
        xpToNext: 100,
        tierName: "Rookie",
        tierColor: "#888",
      }))
    ),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return {
    ...actual,
    TABLES: { ...actual.TABLES, REPS: "reps", DOMAINS: "domains" },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body: unknown, opts: { malformed?: boolean } = {}): NextRequest {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.malformed ? "{not-json" : JSON.stringify(body),
  };
  return new NextRequest("http://localhost:3000/api/auth/mobile-login", init);
}

/**
 * Configure the mocked Supabase-admin `from()` chain.
 *
 * The route does three chained reads:
 *   1. reps by auth_user_id + org_id
 *   2. reps by email + org_id where auth_user_id IS NULL (fallback)
 *   3. reps .update() when auto-linking by email
 *   4. domains by org_id + is_primary + status
 */
function stubAdminFrom({
  repByAuthId,
  repByEmail,
  domain,
}: {
  repByAuthId?: unknown;
  repByEmail?: unknown;
  domain?: unknown;
} = {}) {
  mockFrom.mockReset();

  // Generic chained builder helper that ends in `.single()` or returns the
  // chain for further method calls.
  function chainReturning(value: unknown) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      single: () => Promise.resolve({ data: value, error: null }),
    };
    return chain;
  }

  function updateChain() {
    const chain = {
      update: () => chain,
      eq: () => chain,
    };
    // When called, update returns a thenable that resolves
    (chain as unknown as { then: (r: (v: unknown) => void) => void }).then = (r) => r({ data: null, error: null });
    return chain;
  }

  let callCount = 0;
  mockFrom.mockImplementation((table: string) => {
    callCount += 1;
    if (table === "reps") {
      // First call = lookup by auth_user_id; second call = lookup by email;
      // third call = update auto-link.
      if (callCount === 1) return chainReturning(repByAuthId ?? null);
      if (callCount === 2) return chainReturning(repByEmail ?? null);
      return updateChain();
    }
    if (table === "domains") {
      return chainReturning(domain ?? null);
    }
    return chainReturning(null);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/mobile-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiter.mockReturnValue(null);
    mockSignInWithPassword.mockReset();
    mockFrom.mockReset();
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ password: "hunter2" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/email/i);
  });

  it("returns 400 when password is missing", async () => {
    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "rep@feral.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is malformed JSON", async () => {
    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({}, { malformed: true }));
    expect(res.status).toBe(400);
  });

  it("returns the rate-limit response when rate limiter blocks", async () => {
    const blockedResponse = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    mockRateLimiter.mockReturnValueOnce(blockedResponse);

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "rep@feral.com", password: "hunter2" }));
    expect(res.status).toBe(429);
  });

  it("returns 401 on invalid credentials", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "rep@feral.com", password: "wrong" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
  });

  it("returns 403 when authenticated user has no active rep row for this tenant", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-1", email: "orphan@feral.com" },
        session: { access_token: "a", refresh_token: "r", expires_at: 0 },
      },
      error: null,
    });
    stubAdminFrom({ repByAuthId: null, repByEmail: null });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "orphan@feral.com", password: "hunter2" }));
    expect(res.status).toBe(403);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("allows pending reps to log in (signup is open; team gates happen elsewhere)", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-2", email: "pending@feral.com" },
        session: { access_token: "a", refresh_token: "r", expires_at: 0 },
      },
      error: null,
    });
    stubAdminFrom({
      repByAuthId: { id: "rep-1", auth_user_id: "auth-user-2", status: "pending" },
      domain: { hostname: "feral.entry.events" },
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "pending@feral.com", password: "hunter2" }));
    expect(res.status).toBe(200);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("returns 403 when rep status is 'deleted' (PII scrubbed, account unrecoverable)", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-2d", email: "deleted@feral.com" },
        session: { access_token: "a", refresh_token: "r", expires_at: 0 },
      },
      error: null,
    });
    stubAdminFrom({
      repByAuthId: { id: "rep-1d", auth_user_id: "auth-user-2d", status: "deleted" },
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "deleted@feral.com", password: "hunter2" }));
    expect(res.status).toBe(403);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("auto-links rep by email when auth_user_id is null and returns 200", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-3", email: "unlinked@feral.com" },
        session: {
          access_token: "token-abc",
          refresh_token: "refresh-def",
          expires_at: 1735689600,
        },
      },
      error: null,
    });
    stubAdminFrom({
      repByAuthId: null,
      repByEmail: {
        id: "rep-2",
        auth_user_id: null,
        email: "unlinked@feral.com",
        status: "active",
      },
      domain: { hostname: "feral.entry.events" },
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "unlinked@feral.com", password: "hunter2" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toBe("token-abc");
    expect(json.refresh_token).toBe("refresh-def");
    expect(json.rep.id).toBe("rep-2");
    expect(json.rep.auth_user_id).toBe("auth-user-3");
  });

  it("returns 200 with full payload on happy path", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-4", email: "maya@feral.com" },
        session: {
          access_token: "token-happy",
          refresh_token: "refresh-happy",
          expires_at: 1735689600,
        },
      },
      error: null,
    });
    stubAdminFrom({
      repByAuthId: {
        id: "rep-3",
        auth_user_id: "auth-user-4",
        email: "maya@feral.com",
        display_name: "maya.ok",
        status: "active",
        org_id: "feral",
      },
      domain: { hostname: "feral.entry.events" },
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "maya@feral.com", password: "hunter2" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toBe("token-happy");
    expect(json.refresh_token).toBe("refresh-happy");
    expect(json.expires_at).toBe(1735689600);
    expect(json.rep.id).toBe("rep-3");
    expect(json.rep.display_name).toBe("maya.ok");
    expect(json.org_id).toBe("feral");
    expect(json.settings).toBeDefined();
    expect(json.settings.currency_name).toBe("EP");
    expect(json.settings.level_table).toBeInstanceOf(Array);
    expect(json.settings.public_url).toBe("https://feral.entry.events");
  });

  it("returns null public_url when no primary domain is configured", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-5", email: "rep@noweb.com" },
        session: { access_token: "a", refresh_token: "r", expires_at: 0 },
      },
      error: null,
    });
    stubAdminFrom({
      repByAuthId: { id: "rep-4", auth_user_id: "auth-user-5", status: "active" },
      domain: null,
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    const res = await POST(buildRequest({ email: "rep@noweb.com", password: "hunter2" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings.public_url).toBeNull();
  });

  it("trims and lowercases the email before sign-in", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "auth-user-6", email: "rep@feral.com" },
        session: { access_token: "a", refresh_token: "r", expires_at: 0 },
      },
      error: null,
    });
    stubAdminFrom({
      repByAuthId: { id: "rep-5", auth_user_id: "auth-user-6", status: "active" },
      domain: null,
    });

    const { POST } = await import("@/app/api/auth/mobile-login/route");
    await POST(buildRequest({ email: "  Rep@FERAL.com  ", password: "hunter2" }));
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "rep@feral.com",
      password: "hunter2",
    });
  });
});
