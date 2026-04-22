import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireRepAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRepAuth: (opts?: unknown) => mockRequireRepAuth(opts),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function makeQueryChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.ilike = stub;
  chain.order = stub;
  chain.limit = stub;
  chain.update = stub;
  chain.insert = stub;
  chain.delete = stub;
  chain.upsert = stub;
  chain.single = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  chain.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
    resolve({ data: result.data ?? null, error: result.error ?? null });
    return { catch: () => {} };
  };
  return chain;
}

function authOK(overrides?: Partial<{ id: string; status: string }>) {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: {
      id: "rep-1",
      auth_user_id: "auth-1",
      email: "r@x.com",
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

// ---------------------------------------------------------------------------
// /promoters/[handle]/follow
// ---------------------------------------------------------------------------

describe("POST /api/rep-portal/promoters/[handle]/follow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/follow/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/follow", { method: "POST" }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown promoter", async () => {
    authOK();
    mockFrom.mockImplementation(() => makeQueryChain({ data: null }));
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/follow/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/nope/follow", { method: "POST" }),
      { params: Promise.resolve({ handle: "nope" }) }
    );
    expect(res.status).toBe(404);
  });

  it("creates follow row and returns is_following:true", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: { id: "p1", visibility: "public" },
        });
      }
      if (table === "rep_promoter_follows") {
        return makeQueryChain({ data: null, error: null });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/follow/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/follow", { method: "POST" }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.is_following).toBe(true);
    expect(json.data.promoter_id).toBe("p1");
  });

  it("DELETE removes follow row and returns is_following:false", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: { id: "p1", visibility: "public" },
        });
      }
      return makeQueryChain({ data: null, error: null });
    });
    const { DELETE } = await import(
      "@/app/api/rep-portal/promoters/[handle]/follow/route"
    );
    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/follow", { method: "DELETE" }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.is_following).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /promoters/[handle]/join-request
// ---------------------------------------------------------------------------

describe("POST /api/rep-portal/promoters/[handle]/join-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/join-request/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/join-request", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when promoter is private (invite-only)", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: { id: "p1", visibility: "private" },
        });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/join-request/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/hidden/join-request", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ handle: "hidden" }) }
    );
    expect(res.status).toBe(403);
  });

  it("rejects overlong pitch", async () => {
    authOK();
    mockFrom.mockImplementation(() =>
      makeQueryChain({ data: { id: "p1", visibility: "public" } })
    );
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/join-request/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/join-request", {
        method: "POST",
        body: JSON.stringify({ pitch: "x".repeat(501) }),
      }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(400);
  });

  it("creates a pending membership row for a fresh request", async () => {
    authOK();
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      call += 1;
      if (table === "promoters") {
        return makeQueryChain({
          data: { id: "p1", visibility: "public" },
        });
      }
      if (table === "rep_promoter_memberships") {
        // First call = existing check (returns null), second = insert
        if (call === 2) return makeQueryChain({ data: null }); // existing check
        return makeQueryChain({
          data: {
            id: "m1",
            status: "pending",
            requested_at: "2026-04-22T18:00:00Z",
          },
        });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/join-request/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/join-request", {
        method: "POST",
        body: JSON.stringify({ pitch: "I can bring 20+" }),
      }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.membership.status).toBe("pending");
  });

  it("returns existing membership unchanged when already pending/approved", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: { id: "p1", visibility: "public" },
        });
      }
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({
          data: {
            id: "m-existing",
            status: "approved",
            requested_at: "2026-03-01T00:00:00Z",
          },
        });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import(
      "@/app/api/rep-portal/promoters/[handle]/join-request/route"
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/join-request", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.membership.id).toBe("m-existing");
    expect(json.data.membership.status).toBe("approved");
  });

  it("DELETE withdraws a pending request", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "promoters") {
        return makeQueryChain({
          data: { id: "p1", visibility: "public" },
        });
      }
      return makeQueryChain({ data: null, error: null });
    });
    const { DELETE } = await import(
      "@/app/api/rep-portal/promoters/[handle]/join-request/route"
    );
    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/rep-portal/promoters/feral/join-request", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ handle: "feral" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.withdrawn).toBe(true);
  });
});
