import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: mockFrom, rpc: mockRpc }),
}));

const mockTransfersCreate = vi.fn();
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ transfers: { create: mockTransfersCreate } }),
  verifyConnectedAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCronRequest(token: string | null = "test-secret"): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/cron/ep-payouts", {
    method: "GET",
    headers,
  });
}

function makeQueryChain(result: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const stub = () => chain;
  chain.select = stub;
  chain.eq = stub;
  chain.maybeSingle = () =>
    Promise.resolve({ data: result.data, error: result.error ?? null });
  chain.single = () =>
    Promise.resolve({ data: result.data, error: result.error ?? null });
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/cron/ep-payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockTransfersCreate.mockReset();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 when CRON_SECRET header is missing", async () => {
    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest(null));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET header is wrong", async () => {
    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns zero counters when no tenants meet the threshold", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "plan_tenant_payouts") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      planned: 0,
      paid: 0,
      skipped_no_stripe_account: 0,
      failed: 0,
      total_net_pence: 0,
      failures: [],
    });
  });

  it("skips tenants without a Stripe Connect account", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "plan_tenant_payouts")
        return Promise.resolve({
          data: [
            {
              tenant_org_id: "no-stripe-tenant",
              ep_amount: 10000,
              period_start: "2026-03-22T00:00:00Z",
              period_end: "2026-04-22T00:00:00Z",
              fiat_rate_pence: 1,
              platform_cut_bps: 1000,
              gross_pence: 10000,
              platform_cut_pence: 1000,
              tenant_net_pence: 9000,
            },
          ],
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    });
    // site_settings lookup returns no row
    mockFrom.mockImplementation(() => makeQueryChain({ data: null }));

    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest());
    const json = await res.json();
    expect(json.planned).toBe(1);
    expect(json.paid).toBe(0);
    expect(json.skipped_no_stripe_account).toBe(1);
    expect(mockTransfersCreate).not.toHaveBeenCalled();
  });

  it("happy path — creates pending payout, calls Stripe with idempotency key, completes", async () => {
    mockRpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === "plan_tenant_payouts")
        return Promise.resolve({
          data: [
            {
              tenant_org_id: "feral",
              ep_amount: 10000,
              period_start: "2026-03-22T00:00:00Z",
              period_end: "2026-04-22T00:00:00Z",
              fiat_rate_pence: 1,
              platform_cut_bps: 1000,
              gross_pence: 10000,
              platform_cut_pence: 1000,
              tenant_net_pence: 9000,
            },
          ],
          error: null,
        });
      if (fn === "create_pending_payout")
        return Promise.resolve({ data: "payout-uuid-1", error: null });
      if (fn === "complete_tenant_payout")
        return Promise.resolve({
          data: { success: true, payout_id: args?.p_payout_id },
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    });
    // site_settings returns a connected Stripe account
    mockFrom.mockImplementation(() =>
      makeQueryChain({
        data: { data: { account_id: "acct_test_123", country: "GB" } },
      })
    );
    mockTransfersCreate.mockResolvedValueOnce({ id: "tr_test_abc" });

    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest());
    const json = await res.json();

    expect(json.paid).toBe(1);
    expect(json.total_net_pence).toBe(9000);
    expect(json.failed).toBe(0);

    // Stripe called with the right amount + destination + idempotency key
    expect(mockTransfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 9000,
        currency: "gbp",
        destination: "acct_test_123",
        metadata: expect.objectContaining({
          type: "ep_payout",
          tenant_org_id: "feral",
          payout_id: "payout-uuid-1",
        }),
      }),
      expect.objectContaining({
        idempotencyKey: "ep-payout-payout-uuid-1",
      })
    );

    // Ledger-completing RPC called with the Stripe Transfer id
    expect(mockRpc).toHaveBeenCalledWith("complete_tenant_payout", {
      p_payout_id: "payout-uuid-1",
      p_stripe_transfer_id: "tr_test_abc",
    });
  });

  it("marks payout failed when Stripe Transfer errors", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "plan_tenant_payouts")
        return Promise.resolve({
          data: [
            {
              tenant_org_id: "feral",
              ep_amount: 10000,
              period_start: "2026-03-22T00:00:00Z",
              period_end: "2026-04-22T00:00:00Z",
              fiat_rate_pence: 1,
              platform_cut_bps: 1000,
              gross_pence: 10000,
              platform_cut_pence: 1000,
              tenant_net_pence: 9000,
            },
          ],
          error: null,
        });
      if (fn === "create_pending_payout")
        return Promise.resolve({ data: "payout-uuid-1", error: null });
      if (fn === "fail_tenant_payout")
        return Promise.resolve({ data: null, error: null });
      if (fn === "complete_tenant_payout")
        return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    mockFrom.mockImplementation(() =>
      makeQueryChain({
        data: { data: { account_id: "acct_test_123" } },
      })
    );
    mockTransfersCreate.mockRejectedValueOnce(new Error("insufficient balance"));

    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest());
    const json = await res.json();

    expect(json.paid).toBe(0);
    expect(json.failed).toBe(1);
    expect(json.failures[0]).toMatchObject({
      tenant_org_id: "feral",
      reason: expect.stringContaining("insufficient balance"),
    });

    // fail_tenant_payout was called, complete_tenant_payout was NOT
    const fnCalls = mockRpc.mock.calls.map((c) => c[0]);
    expect(fnCalls).toContain("fail_tenant_payout");
    expect(fnCalls).not.toContain("complete_tenant_payout");
  });

  it("reports failure when plan_tenant_payouts RPC itself errors", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "plan_tenant_payouts")
        return Promise.resolve({ data: null, error: { message: "db down" } });
      return Promise.resolve({ data: null, error: null });
    });

    const { GET } = await import("@/app/api/cron/ep-payouts/route");
    const res = await GET(buildCronRequest());
    expect(res.status).toBe(500);
  });
});
