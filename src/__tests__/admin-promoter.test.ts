import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockRequireAuth(),
}));

const mockFrom = vi.fn();
const mockAdminClient = { from: mockFrom };
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockAdminClient),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authOK(orgId = "feral") {
  mockRequireAuth.mockResolvedValueOnce({
    user: { id: "admin-user-1", email: "admin@feral.com" },
    orgId,
    error: null,
  });
}

function authFail(status = 401) {
  mockRequireAuth.mockResolvedValueOnce({
    user: null,
    orgId: null,
    error: NextResponse.json({ error: "unauthorized" }, { status }),
  });
}

function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/promoter", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Build a chainable mock for `db.from(...)` that handles:
 *   - .select(...).eq(...).single()           — GET + uniqueness check
 *   - .select(...).eq(...).limit(...).single()
 *   - .update(...).eq(...).select().single()  — PATCH
 */
function stubPromotersTable({
  getResult,
  uniquenessResult,
  updateResult,
}: {
  getResult?: { data: unknown; error: unknown };
  uniquenessResult?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
}) {
  mockFrom.mockReset();

  let nextSelect: "get" | "uniqueness" = "get";

  mockFrom.mockImplementation((table: string) => {
    if (table !== "promoters") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const chain = {
      select: (_?: string) => {
        return chain;
      },
      eq: (_col: string, _val: string) => chain,
      limit: (_n: number) => chain,
      single: () => {
        // If we're in the uniqueness-check flow, use that result.
        if (nextSelect === "uniqueness") {
          return Promise.resolve(
            uniquenessResult ?? { data: null, error: null }
          );
        }
        // Update-then-select chain
        if ("_isUpdate" in (chain as object)) {
          return Promise.resolve(
            updateResult ?? { data: null, error: null }
          );
        }
        // Default: GET
        return Promise.resolve(getResult ?? { data: null, error: null });
      },
      update: (_values: Record<string, unknown>) => {
        (chain as unknown as Record<string, boolean>)._isUpdate = true;
        return chain;
      },
    };

    // The second call to from("promoters") during a PATCH (uniqueness check
    // when handle is updated) reuses the chain; flip the mode.
    mockFrom.mock.calls.forEach((_, idx) => {
      if (idx === 1) nextSelect = "uniqueness";
    });

    return chain;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/promoter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail(401);
    const { GET } = await import("@/app/api/admin/promoter/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when the tenant has no promoter row", async () => {
    authOK();
    stubPromotersTable({
      getResult: { data: null, error: { message: "no rows" } },
    });
    const { GET } = await import("@/app/api/admin/promoter/route");
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns the promoter row on happy path", async () => {
    authOK();
    stubPromotersTable({
      getResult: {
        data: {
          id: "promoter-uuid",
          org_id: "feral",
          handle: "feral",
          display_name: "FERAL PRESENTS",
          accent_hex: 12077567,
          follower_count: 0,
          team_size: 6,
        },
        error: null,
      },
    });
    const { GET } = await import("@/app/api/admin/promoter/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.handle).toBe("feral");
    expect(json.data.team_size).toBe(6);
  });
});

describe("PATCH /api/admin/promoter — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail(401);
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ display_name: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no valid fields are present", async () => {
    authOK();
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects a handle that fails the regex", async () => {
    authOK();
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ handle: "-bad-" }));
    expect(res.status).toBe(400);
  });

  it("rejects a reserved slug handle (genuine claim)", async () => {
    authOK();
    // Handle lookup returns no existing promoter → genuine claim attempt
    mockFrom.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        single: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    });
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ handle: "admin" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/reserved/i);
  });

  it("rejects display_name shorter than 2 chars", async () => {
    authOK();
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ display_name: "a" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty display_name (non-nullable)", async () => {
    authOK();
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ display_name: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid accent_hex", async () => {
    authOK();
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ accent_hex: -1 }));
    expect(res.status).toBe(400);

    authOK();
    const res2 = await PATCH(buildPatchRequest({ accent_hex: 0x1000000 }));
    expect(res2.status).toBe(400);

    authOK();
    const res3 = await PATCH(buildPatchRequest({ accent_hex: "#ff0000" }));
    expect(res3.status).toBe(400);
  });

  it("rejects invalid visibility value", async () => {
    authOK();
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ visibility: "hidden" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON body", async () => {
    authOK();
    const req = new NextRequest("http://localhost:3000/api/admin/promoter", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/promoter — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("updates allowed fields and returns new row", async () => {
    authOK();

    // Chain used by the final UPDATE — single call to from("promoters")
    // because the input has no handle change, so no uniqueness pre-check.
    const updatedRow = {
      id: "promoter-uuid",
      org_id: "feral",
      handle: "feral",
      display_name: "FERAL ✦ Presents",
      tagline: "warehouse parties",
      bio: "est. 2019",
      accent_hex: 16711680,
      instagram: "feralpresents",
      tiktok: null,
      visibility: "public",
    };
    mockFrom.mockImplementation(() => {
      const chain = {
        update: () => chain,
        eq: () => chain,
        select: () => chain,
        single: () => Promise.resolve({ data: updatedRow, error: null }),
      };
      return chain;
    });

    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(
      buildPatchRequest({
        display_name: "FERAL ✦ Presents",
        tagline: "warehouse parties",
        bio: "est. 2019",
        accent_hex: 16711680,
        instagram: "@feralpresents",
        visibility: "public",
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.display_name).toBe("FERAL ✦ Presents");
    expect(json.data.accent_hex).toBe(16711680);
  });

  it("strips leading @ from instagram/tiktok", async () => {
    authOK();

    let capturedUpdate: Record<string, unknown> | null = null;
    mockFrom.mockImplementation(() => {
      const chain = {
        update: (values: Record<string, unknown>) => {
          capturedUpdate = values;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        single: () =>
          Promise.resolve({
            data: { ...(capturedUpdate ?? {}), id: "x", org_id: "feral" },
            error: null,
          }),
      };
      return chain;
    });

    const { PATCH } = await import("@/app/api/admin/promoter/route");
    await PATCH(
      buildPatchRequest({
        instagram: "@@feralpresents",
        tiktok: "@feralpresents",
      })
    );

    expect(capturedUpdate).not.toBeNull();
    expect(capturedUpdate!.instagram).toBe("feralpresents");
    expect(capturedUpdate!.tiktok).toBe("feralpresents");
  });

  it("returns 409 when new handle is already taken by another tenant", async () => {
    authOK();

    mockFrom.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        update: () => chain,
        // Handle lookup returns a row owned by another tenant
        single: () =>
          Promise.resolve({ data: { org_id: "other-org" }, error: null }),
      };
      return chain;
    });

    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ handle: "taken" }));
    expect(res.status).toBe(409);
  });

  it("allows setting handle to the tenant's OWN existing handle (idempotent save — bypasses RESERVED_SLUGS)", async () => {
    // FERAL's handle is "feral" which is in RESERVED_SLUGS (reserved so new
    // tenants can't claim it), so the tenant must still be able to save their
    // own profile without getting a 400.
    authOK();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        update: () => chain,
        single: () => {
          if (callCount === 1) {
            // Handle lookup: "feral" exists and belongs to this tenant
            return Promise.resolve({
              data: { org_id: "feral" },
              error: null,
            });
          }
          // Update-then-select result
          return Promise.resolve({
            data: { id: "promoter-uuid", org_id: "feral", handle: "feral" },
            error: null,
          });
        },
      };
      return chain;
    });

    const { PATCH } = await import("@/app/api/admin/promoter/route");
    const res = await PATCH(buildPatchRequest({ handle: "feral" }));
    expect(res.status).toBe(200);
  });
});
