import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockRequireAuth(),
}));

const mockPurchaseInsert = vi.fn();
const mockPurchaseUpdate = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

const mockCreatePaymentIntent = vi.fn();
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    paymentIntents: { create: mockCreatePaymentIntent },
  }),
  verifyConnectedAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ep/config", () => ({
  getEpConfig: vi.fn().mockResolvedValue({
    fiat_rate_pence: 1,
    platform_cut_bps: 1000,
    min_payout_pence: 5000,
    refund_window_days: 90,
    default_bonus_ep_per_quest: 0,
  }),
  epToPence: (ep: number, rate: number) => Math.round(ep * rate),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authOK(orgId = "feral") {
  mockRequireAuth.mockResolvedValueOnce({
    user: { id: "admin-1", email: "a@x.com" },
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

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/ep/purchase-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stubPurchaseTable({
  insertResult,
  updateError,
}: {
  insertResult?: { data: unknown; error: unknown };
  updateError?: unknown;
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== "ep_tenant_purchases") {
      return makeChain({ data: null });
    }
    const chain: Record<string, unknown> = {};
    const stub = () => chain;
    chain.insert = () => {
      mockPurchaseInsert();
      return chain;
    };
    chain.update = () => {
      mockPurchaseUpdate();
      return chain;
    };
    chain.select = stub;
    chain.eq = stub;
    chain.single = () =>
      Promise.resolve(insertResult ?? { data: { id: "purchase-1" }, error: null });
    (chain as { then?: unknown }).then = (r: (v: unknown) => void) => {
      r({ data: null, error: updateError ?? null });
      return { catch: () => {} };
    };
    return chain;
  });
}

function makeChain(result: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.update = stub;
  chain.insert = stub;
  chain.single = () =>
    Promise.resolve({ data: result.data, error: result.error ?? null });
  (chain as { then?: unknown }).then = (r: (v: unknown) => void) => {
    r({ data: result.data, error: result.error ?? null });
    return { catch: () => {} };
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/ep/purchase-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCreatePaymentIntent.mockReset();
    mockPurchaseInsert.mockReset();
    mockPurchaseUpdate.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authFail();
    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 1000 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing ep_amount", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for below-minimum ep_amount", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 50 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for above-maximum ep_amount", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 100_000_000 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-integer ep_amount", async () => {
    authOK();
    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 100.5 }));
    expect(res.status).toBe(400);
  });

  it("creates a pending purchase + Stripe PaymentIntent on happy path", async () => {
    authOK("feral");
    stubPurchaseTable({
      insertResult: { data: { id: "purchase-uuid" }, error: null },
    });
    mockCreatePaymentIntent.mockResolvedValueOnce({
      id: "pi_test_abc",
      client_secret: "pi_test_abc_secret_xyz",
    });

    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 10000 }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.payment_intent_id).toBe("pi_test_abc");
    expect(json.data.client_secret).toBe("pi_test_abc_secret_xyz");
    expect(json.data.ep_amount).toBe(10000);
    expect(json.data.fiat_pence).toBe(10000); // 10000 EP × 1p = £100
    expect(json.data.fiat_currency).toBe("GBP");
    expect(json.data.purchase_id).toBe("purchase-uuid");

    // Verify Stripe was called with right metadata
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        currency: "gbp",
        metadata: expect.objectContaining({
          type: "ep_purchase",
          tenant_org_id: "feral",
          ep_amount: "10000",
          fiat_rate_pence: "1",
          purchase_id: "purchase-uuid",
        }),
      })
    );

    // Verify purchase was created then updated with the PI id
    expect(mockPurchaseInsert).toHaveBeenCalledTimes(1);
    expect(mockPurchaseUpdate).toHaveBeenCalledTimes(1);
  });

  it("rolls back purchase status when Stripe creation fails", async () => {
    authOK();
    stubPurchaseTable({
      insertResult: { data: { id: "purchase-uuid" }, error: null },
    });
    mockCreatePaymentIntent.mockRejectedValueOnce(new Error("stripe down"));

    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 1000 }));
    expect(res.status).toBe(502);
    // Purchase was inserted then updated to 'failed'
    expect(mockPurchaseUpdate).toHaveBeenCalled();
  });

  it("returns 500 when initial purchase insert fails", async () => {
    authOK();
    stubPurchaseTable({
      insertResult: { data: null, error: { message: "constraint violation" } },
    });

    const { POST } = await import("@/app/api/admin/ep/purchase-intent/route");
    const res = await POST(buildRequest({ ep_amount: 1000 }));
    expect(res.status).toBe(500);
    // Stripe should never be called if the row insert fails
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });
});
