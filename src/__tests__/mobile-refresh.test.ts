import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefreshSession = vi.fn();
const mockSupabaseClient = {
  auth: {
    refreshSession: mockRefreshSession,
  },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

const mockRateLimiter = vi.fn().mockReturnValue(null);
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => mockRateLimiter,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body: unknown, opts: { malformed?: boolean } = {}): NextRequest {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.malformed ? "{not-json" : JSON.stringify(body),
  };
  return new NextRequest("http://localhost:3000/api/auth/mobile-refresh", init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/mobile-refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiter.mockReturnValue(null);
    mockRefreshSession.mockReset();
  });

  it("returns 400 when refresh_token is missing", async () => {
    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/refresh_token/i);
  });

  it("returns 400 when refresh_token is not a string", async () => {
    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({ refresh_token: 12345 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is malformed JSON", async () => {
    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({}, { malformed: true }));
    expect(res.status).toBe(400);
  });

  it("returns the rate-limit response when rate limiter blocks", async () => {
    const blockedResponse = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    mockRateLimiter.mockReturnValueOnce(blockedResponse);

    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({ refresh_token: "any" }));
    expect(res.status).toBe(429);
  });

  it("returns 401 when Supabase rejects the refresh token", async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid Refresh Token" },
    });

    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({ refresh_token: "expired-token" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
  });

  it("returns 401 when Supabase returns no session even with no error", async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({ refresh_token: "bogus" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with rotated tokens on happy path", async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_at: 1735689600,
        },
        user: { id: "auth-user-1" },
      },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({ refresh_token: "old-refresh-token" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toBe("new-access-token");
    expect(json.refresh_token).toBe("new-refresh-token");
    expect(json.expires_at).toBe(1735689600);

    // Verify the refresh was called with the client-supplied token
    expect(mockRefreshSession).toHaveBeenCalledWith({
      refresh_token: "old-refresh-token",
    });
  });

  it("does not leak rep or user data in the response", async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "a",
          refresh_token: "r",
          expires_at: 0,
        },
        user: {
          id: "auth-user-2",
          email: "rep@example.com",
          app_metadata: { secret: "do-not-leak" },
        },
      },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    const res = await POST(buildRequest({ refresh_token: "x" }));
    const json = await res.json();
    expect(json.user).toBeUndefined();
    expect(json.rep).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("rep@example.com");
    expect(JSON.stringify(json)).not.toContain("do-not-leak");
  });

  it("creates the stateless Supabase client with session persistence disabled", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    mockRefreshSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "a", refresh_token: "r", expires_at: 0 },
        user: null,
      },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/mobile-refresh/route");
    await POST(buildRequest({ refresh_token: "x" }));

    expect(createClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }),
      })
    );
  });
});
