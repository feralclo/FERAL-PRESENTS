import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireRepAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRepAuth: (opts?: unknown) => mockRequireRepAuth(opts),
}));

const mockCreateSignedUploadUrl = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockList = vi.fn();
const mockRemove = vi.fn();

const mockSupabase = {
  storage: {
    from: vi.fn(() => ({
      createSignedUploadUrl: mockCreateSignedUploadUrl,
      getPublicUrl: mockGetPublicUrl,
      list: mockList,
      remove: mockRemove,
    })),
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function authOK(repId = "rep-1") {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: { id: repId, auth_user_id: "auth-1", email: "r@x.com", org_id: "feral", status: "active" },
    error: null,
  });
}

function authFail(status = 401) {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: null,
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

// ---------------------------------------------------------------------------
// /uploads/signed-url
// ---------------------------------------------------------------------------

describe("POST /api/rep-portal/uploads/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUploadUrl.mockReset();
    mockGetPublicUrl.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import("@/app/api/rep-portal/uploads/signed-url/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/signed-url", {
        kind: "avatar",
        content_type: "image/jpeg",
        size_bytes: 1000,
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid kind", async () => {
    authOK();
    const { POST } = await import("@/app/api/rep-portal/uploads/signed-url/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/signed-url", {
        kind: "bogus",
        content_type: "image/jpeg",
        size_bytes: 1000,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects disallowed content_type", async () => {
    authOK();
    const { POST } = await import("@/app/api/rep-portal/uploads/signed-url/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/signed-url", {
        kind: "avatar",
        content_type: "application/pdf",
        size_bytes: 1000,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds per-kind cap", async () => {
    authOK();
    const { POST } = await import("@/app/api/rep-portal/uploads/signed-url/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/signed-url", {
        kind: "avatar",
        content_type: "image/jpeg",
        size_bytes: 5 * 1024 * 1024, // 5MB > 2MB avatar cap
      })
    );
    expect(res.status).toBe(413);
  });

  it("returns signed upload URL + public URL + key on happy path", async () => {
    authOK("rep-xyz");
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://supabase.test/storage/sign-url", token: "tok" },
      error: null,
    });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: "https://supabase.test/storage/rep-media/avatars/rep-xyz/abc.jpg" },
    });

    const { POST } = await import("@/app/api/rep-portal/uploads/signed-url/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/signed-url", {
        kind: "quest_proof",
        content_type: "image/jpeg",
        size_bytes: 500000,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.upload_url).toBe("https://supabase.test/storage/sign-url");
    expect(json.data.public_url).toContain("rep-xyz");
    expect(json.data.key).toMatch(/^quest-proofs\/rep-xyz\/[0-9a-f-]{36}\.jpeg$/);
    expect(json.data.expires_at).toBeTypeOf("string");
  });
});

// ---------------------------------------------------------------------------
// /uploads/complete
// ---------------------------------------------------------------------------

describe("POST /api/rep-portal/uploads/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockReset();
    mockGetPublicUrl.mockReset();
    mockRemove.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", {
        key: "avatars/rep-1/11111111-1111-1111-1111-111111111111.jpg",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing key", async () => {
    authOK();
    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", {})
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when key's rep_id does not match the caller", async () => {
    authOK("rep-1");
    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", {
        key: "avatars/rep-OTHER/11111111-1111-1111-1111-111111111111.jpg",
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for bogus key format", async () => {
    authOK("rep-1");
    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", {
        key: "not-a-valid-key-path",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when object does not exist in storage", async () => {
    authOK("rep-1");
    mockList.mockResolvedValueOnce({ data: [], error: null });
    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", {
        key: "avatars/rep-1/11111111-1111-1111-1111-111111111111.jpg",
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 413 and removes object when it exceeds cap", async () => {
    authOK("rep-1");
    const filename = "11111111-1111-1111-1111-111111111111.jpg";
    mockList.mockResolvedValueOnce({
      data: [{ name: filename, metadata: { size: 5 * 1024 * 1024 } }],
      error: null,
    });
    mockRemove.mockResolvedValueOnce({ data: null, error: null });

    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", {
        key: `avatars/rep-1/${filename}`,
      })
    );
    expect(res.status).toBe(413);
    expect(mockRemove).toHaveBeenCalled();
  });

  it("returns public_url + size on happy path", async () => {
    authOK("rep-1");
    const filename = "11111111-1111-1111-1111-111111111111.jpg";
    const key = `quest-proofs/rep-1/${filename}`;
    mockList.mockResolvedValueOnce({
      data: [{ name: filename, metadata: { size: 100_000 } }],
      error: null,
    });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: `https://supabase.test/storage/rep-media/${key}` },
    });

    const { POST } = await import("@/app/api/rep-portal/uploads/complete/route");
    const res = await POST(
      buildPost("http://localhost:3000/api/rep-portal/uploads/complete", { key })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.key).toBe(key);
    expect(json.data.size_bytes).toBe(100_000);
    expect(json.data.public_url).toContain(key);
  });
});
