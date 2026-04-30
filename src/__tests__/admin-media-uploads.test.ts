import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockRequireAuth(),
}));

const mockCreateSignedUploadUrl = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockList = vi.fn();
const mockRemove = vi.fn();
const mockDownload = vi.fn();
const mockUpload = vi.fn();
const mockFromQuery = vi.fn();
const mockInsertSelectSingle = vi.fn();

const mockSupabase = {
  storage: {
    from: vi.fn(() => ({
      createSignedUploadUrl: mockCreateSignedUploadUrl,
      getPublicUrl: mockGetPublicUrl,
      list: mockList,
      remove: mockRemove,
      download: mockDownload,
      upload: mockUpload,
    })),
  },
  from: vi.fn(() => mockFromQuery()),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Skip the Sharp optimisation pipeline in unit tests — covered separately.
// Returning null exercises the graceful-fallback path: original file is kept.
vi.mock("@/lib/uploads/optimize-image", () => ({
  optimizeTenantMediaImage: vi.fn().mockResolvedValue(null),
}));

function authOK(orgId = "feral", userId = "user-1") {
  mockRequireAuth.mockResolvedValueOnce({
    user: { id: userId, email: "a@x.com" },
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

function buildPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/media/signed-url
// ─────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/media/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUploadUrl.mockReset();
    mockGetPublicUrl.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import("@/app/api/admin/media/signed-url/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/signed-url", {
        kind: "quest_cover",
        content_type: "image/jpeg",
        size_bytes: 1000,
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid kind", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/media/signed-url/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/signed-url", {
        kind: "bogus",
        content_type: "image/jpeg",
        size_bytes: 1000,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects disallowed mime type", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/media/signed-url/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/signed-url", {
        kind: "quest_cover",
        content_type: "video/mp4",
        size_bytes: 1000,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds the cap", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/media/signed-url/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/signed-url", {
        kind: "quest_cover",
        content_type: "image/jpeg",
        size_bytes: 50 * 1024 * 1024,
      })
    );
    expect(res.status).toBe(413);
  });

  it("returns a signed URL with org-scoped key on happy path", async () => {
    authOK("acme");
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://test/sign", token: "tok" },
      error: null,
    });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: "https://test/pub/acme/quest-covers/x.jpg" },
    });

    const { POST } = await import("@/app/api/admin/media/signed-url/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/signed-url", {
        kind: "quest_cover",
        content_type: "image/jpeg",
        size_bytes: 500_000,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.upload_url).toBe("https://test/sign");
    expect(json.data.key).toMatch(/^acme\/quest-covers\/[0-9a-f-]{36}\.jpg$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/media/complete
// ─────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/media/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockReset();
    mockRemove.mockReset();
    mockGetPublicUrl.mockReset();
    mockDownload.mockReset();
    mockUpload.mockReset();
    mockFromQuery.mockReset();
    mockInsertSelectSingle.mockReset();
    // Default download = bytes available; optimize-image mock returns null
    // (graceful fallback), so the original key/url is kept.
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(8) },
      error: null,
    });
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import("@/app/api/admin/media/complete/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/complete", { key: "feral/quest-covers/abc.jpg" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects keys that don't belong to the caller's org", async () => {
    authOK("feral");
    const { POST } = await import("@/app/api/admin/media/complete/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/complete", {
        key: "other-org/quest-covers/00000000-0000-0000-0000-000000000000.jpg",
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects malformed key", async () => {
    authOK("feral");
    const { POST } = await import("@/app/api/admin/media/complete/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/complete", { key: "wat" })
    );
    expect(res.status).toBe(400);
  });

  it("inserts a tenant_media row on happy path", async () => {
    authOK("acme", "user-99");
    mockList.mockResolvedValueOnce({
      data: [
        {
          name: "00000000-0000-0000-0000-000000000000.jpg",
          metadata: { size: 100_000, mimetype: "image/jpeg" },
        },
      ],
      error: null,
    });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: "https://test/pub/acme/quest-covers/abc.jpg" },
    });
    const insertedRow = {
      id: "row-1",
      org_id: "acme",
      kind: "quest_cover",
      url: "https://test/pub/acme/quest-covers/abc.jpg",
    };
    mockFromQuery.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/admin/media/complete/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/complete", {
        key: "acme/quest-covers/00000000-0000-0000-0000-000000000000.jpg",
        kind: "quest_cover",
        width: 600,
        height: 800,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe("row-1");
    expect(json.data.url).toContain("acme/quest-covers");
  });

  it("returns 404 when storage object isn't found", async () => {
    authOK("feral");
    mockList.mockResolvedValueOnce({ data: [], error: null });

    const { POST } = await import("@/app/api/admin/media/complete/route");
    const res = await POST(
      buildPost("http://localhost/api/admin/media/complete", {
        key: "feral/quest-covers/00000000-0000-0000-0000-000000000000.jpg",
        kind: "quest_cover",
      })
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/media/[id] — edit group/tag
// ─────────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/media/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromQuery.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { PATCH } = await import("@/app/api/admin/media/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/media/abc", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group: "Test" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when row belongs to another org", async () => {
    authOK("feral");
    mockFromQuery.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "abc", org_id: "other-org" },
            error: null,
          }),
        }),
      }),
    });
    const { PATCH } = await import("@/app/api/admin/media/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/media/abc", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group: "Hijack" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });

  it("rejects non-string group payloads", async () => {
    authOK("feral");
    const { PATCH } = await import("@/app/api/admin/media/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/media/abc", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group: 12345 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("clears tags when group is null", async () => {
    authOK("feral");
    let updateCalledWith: unknown = null;
    mockFromQuery.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: "abc", org_id: "feral" }, error: null }),
        }),
      }),
      update: vi.fn().mockImplementation((payload: unknown) => {
        updateCalledWith = payload;
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "abc", org_id: "feral", tags: [] },
                error: null,
              }),
            }),
          }),
        };
      }),
    }));

    const { PATCH } = await import("@/app/api/admin/media/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/media/abc", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group: null }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(200);
    expect(updateCalledWith).toEqual({ tags: [] });
  });
});
