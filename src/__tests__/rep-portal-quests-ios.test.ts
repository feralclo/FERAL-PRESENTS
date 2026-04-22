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

function makeQueryChain(result: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.in = stub;
  chain.or = stub;
  chain.contains = stub;
  chain.gte = stub;
  chain.order = stub;
  chain.limit = stub;
  chain.upsert = stub;
  chain.single = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  chain.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
    resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    });
    return { catch: () => {} };
  };
  return chain;
}

function authOK() {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: {
      id: "rep-1",
      auth_user_id: "auth-1",
      email: "r@x.com",
      org_id: "feral",
      status: "active",
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
// /api/rep-portal/quests
// ---------------------------------------------------------------------------

describe("GET /api/rep-portal/quests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { GET } = await import("@/app/api/rep-portal/quests/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/quests")
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid status filter", async () => {
    authOK();
    const { GET } = await import("@/app/api/rep-portal/quests/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/quests?status=bogus")
    );
    expect(res.status).toBe(400);
  });

  it("returns empty list when rep has no memberships and no quests", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({ data: [] });
      }
      if (table === "rep_quests") {
        return makeQueryChain({ data: [] });
      }
      return makeQueryChain({ data: [] });
    });
    const { GET } = await import("@/app/api/rep-portal/quests/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/quests")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });

  it("shapes a quest with promoter + event + my_submissions per iOS contract", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({
          data: [
            {
              promoter_id: "p1",
              promoter: {
                id: "p1",
                org_id: "feral",
                handle: "feral",
                display_name: "FERAL",
                accent_hex: 16711680,
              },
            },
          ],
        });
      }
      if (table === "rep_quests") {
        return makeQueryChain({
          data: [
            {
              id: "q1",
              title: "Post a story",
              subtitle: null,
              description: "short",
              instructions: "post on IG",
              quest_type: "social_post",
              platform: "instagram",
              proof_type: "screenshot",
              xp_reward: 200,
              points_reward: 200,
              currency_reward: 50,
              ep_reward: 50,
              sales_target: null,
              max_completions: 1,
              starts_at: "2026-01-01T00:00:00Z",
              expires_at: "2026-12-31T00:00:00Z",
              cover_image_url: "https://cdn/q.jpg",
              image_url: null,
              banner_image_url: null,
              accent_hex: null,
              accent_hex_secondary: null,
              promoter_id: "p1",
              event_id: "evt-1",
              auto_approve: false,
              event: {
                id: "evt-1",
                name: "FERAL vs. IWF",
                slug: "feral-vs-iwf",
                date_start: "2026-05-10T22:00:00Z",
                cover_image_url: "https://cdn/evt.jpg",
                cover_image: null,
              },
            },
          ],
        });
      }
      if (table === "rep_quest_submissions") {
        return makeQueryChain({
          data: [
            {
              id: "sub-1",
              quest_id: "q1",
              status: "pending",
              created_at: "2026-04-20T00:00:00Z",
              rejection_reason: null,
              requires_revision: false,
            },
          ],
        });
      }
      if (table === "rep_quest_acceptances") {
        return makeQueryChain({
          data: [{ quest_id: "q1", accepted_at: "2026-04-19T00:00:00Z" }],
        });
      }
      return makeQueryChain({ data: [] });
    });

    const { GET } = await import("@/app/api/rep-portal/quests/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/rep-portal/quests")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    const q = json.data[0];
    expect(q.id).toBe("q1");
    expect(q.kind).toBe("social_post");
    expect(q.platform).toBe("instagram");
    expect(q.proof_type).toBe("screenshot");
    expect(q.xp_reward).toBe(200);
    expect(q.ep_reward).toBe(50);
    expect(q.promoter).toEqual({
      id: "p1",
      handle: "feral",
      display_name: "FERAL",
      accent_hex: 16711680,
    });
    expect(q.event.slug).toBe("feral-vs-iwf");
    expect(q.event.cover_image_url).toBe("https://cdn/evt.jpg");
    expect(q.accepted).toBe(true);
    expect(q.my_submissions.total).toBe(1);
    expect(q.my_submissions.pending).toBe(1);
    expect(q.my_submissions.latest).toEqual({
      id: "sub-1",
      status: "pending",
      submitted_at: "2026-04-20T00:00:00Z",
      rejection_reason: null,
      requires_revision: false,
    });
  });
});

// ---------------------------------------------------------------------------
// /api/rep-portal/quests/[id]/accept
// ---------------------------------------------------------------------------

describe("POST /api/rep-portal/quests/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid quest id", async () => {
    authOK();
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when quest not found", async () => {
    authOK();
    mockFrom.mockImplementation(() => makeQueryChain({ data: null }));
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when quest status is not active", async () => {
    authOK();
    mockFrom.mockImplementation(() =>
      makeQueryChain({ data: { id: "q1", status: "archived", promoter_id: null } })
    );
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 403 when rep has no approved membership for quest's promoter", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "rep_quests") {
        return makeQueryChain({
          data: { id: "q1", status: "active", promoter_id: "other-promoter" },
        });
      }
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({ data: null });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
    });
    expect(res.status).toBe(403);
  });

  it("upserts acceptance and returns accepted:true on happy path", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "rep_quests") {
        return makeQueryChain({
          data: { id: "q1", status: "active", promoter_id: "p1" },
        });
      }
      if (table === "rep_promoter_memberships") {
        return makeQueryChain({ data: { status: "approved" } });
      }
      if (table === "rep_quest_acceptances") {
        return makeQueryChain({
          data: { accepted_at: "2026-04-22T18:00:00Z" },
        });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.accepted).toBe(true);
    expect(json.data.accepted_at).toBe("2026-04-22T18:00:00Z");
  });

  it("allows accepting platform-level quests (promoter_id=null) without membership check", async () => {
    authOK();
    mockFrom.mockImplementation((table: string) => {
      if (table === "rep_quests") {
        return makeQueryChain({
          data: { id: "q1", status: "active", promoter_id: null },
        });
      }
      if (table === "rep_quest_acceptances") {
        return makeQueryChain({
          data: { accepted_at: "2026-04-22T18:00:00Z" },
        });
      }
      return makeQueryChain({ data: null });
    });
    const { POST } = await import("@/app/api/rep-portal/quests/[id]/accept/route");
    const res = await POST(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
    });
    expect(res.status).toBe(200);
  });
});
