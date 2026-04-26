/**
 * Integration tests for POST /api/stripe/payment-intent
 *
 * These tests hit the REAL Supabase database to verify:
 * - Event/ticket-type fetches work against the real schema
 * - Sold-out detection uses real sold/capacity values
 * - Discount validation queries real discounts table
 * - The increment_discount_used RPC actually increments in Postgres
 * - Amount calculations use real ticket prices
 *
 * Stripe stays mocked (no real charges).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  TEST_ORG_ID,
  supabase,
  seedTestData,
  cleanupAllTestData,
  resetSoldCounts,
  resetDiscountUsedCount,
  type SeedData,
} from "./setup";

// ---------------------------------------------------------------------------
// Mocks — Stripe + side effects only. Supabase is REAL.
// ---------------------------------------------------------------------------

const mockPaymentIntentsCreate = vi.fn();
// Mirror the real PI's confirmable status so the post-create retrieve()
// (added in commit ee86687 — "idempotent responses lie") doesn't throw or
// trigger the dead-PI fresh-key fallback. Returns whatever .create returned
// — same shape, same status — so the route flows straight through.
const mockPaymentIntentsRetrieve = vi.fn().mockImplementation(() => {
  const last = mockPaymentIntentsCreate.mock.results.at(-1);
  if (last && last.type === "return") {
    return Promise.resolve(last.value);
  }
  return Promise.resolve({ id: "pi_mock", status: "requires_payment_method" });
});
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      retrieve: mockPaymentIntentsRetrieve,
    },
  }),
  verifyConnectedAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => TEST_ORG_ID,
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/payment-monitor", () => ({
  logPaymentEvent: vi.fn(),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/plans", () => ({
  getOrgPlan: vi.fn().mockResolvedValue({ fee_percent: 3.5, min_fee: 30 }),
}));

vi.mock("@/lib/org-settings", () => ({
  getOrgBaseCurrency: vi.fn().mockResolvedValue("GBP"),
}));

vi.mock("@/lib/ticket-visibility", () => ({
  validateSequentialPurchase: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/checkout-guards", () => ({
  isRestrictedCheckoutEmail: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/vat", () => ({
  calculateCheckoutVat: vi.fn().mockReturnValue(null),
  DEFAULT_VAT_SETTINGS: {
    vat_registered: false,
    vat_number: "",
    vat_rate: 0,
    prices_include_vat: true,
  },
}));

vi.mock("@/lib/currency/exchange-rates", () => ({
  getExchangeRates: vi.fn().mockResolvedValue(null),
  convertCurrency: vi.fn(),
  roundPresentmentPrice: vi.fn(),
  areRatesFreshForCheckout: vi.fn().mockReturnValue(false),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/stripe/payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-org-id": TEST_ORG_ID },
    body: JSON.stringify(body),
  });
}

function makeBody(seed: SeedData, overrides?: Record<string, unknown>) {
  return {
    event_id: seed.eventId,
    items: [{ ticket_type_id: seed.ticketTypeId, qty: 2 }],
    customer: {
      email: "integration@test.com",
      first_name: "Test",
      last_name: "Buyer",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/payment-intent — integration", () => {
  let seed: SeedData;

  beforeAll(async () => {
    // Clean any leftover test data, then seed fresh
    await cleanupAllTestData();
    seed = await seedTestData();
  });

  afterAll(async () => {
    try {
      await cleanupAllTestData();
    } catch {
      // Best-effort cleanup
    }
  });

  afterEach(async () => {
    vi.clearAllMocks();
    // Reset sold counts and discount used_count after each test
    await resetSoldCounts([seed.ticketTypeId, seed.ticketTypeLargeId]);
    await resetDiscountUsedCount(seed.discountId, 0);
    // Re-set default mock behavior
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_inttest",
      client_secret: "pi_inttest_secret",
    });
  });

  // ── Fetches real data ───────────────────────────────────────────────────

  it("fetches real event and ticket types, returns correct amount", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_inttest",
      client_secret: "pi_inttest_secret",
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(makeBody(seed));
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payment_intent_id).toBe("pi_inttest");
    expect(json.client_secret).toBe("pi_inttest_secret");
    // 2 × £25 = £50 = 5000 pence
    expect(json.amount).toBe(5000);
    expect(json.currency).toBe("gbp");
  });

  // ── Sold-out detection ──────────────────────────────────────────────────

  it("detects sold-out tickets from real sold/capacity values", async () => {
    // Set sold = 9 out of capacity = 10, then request qty = 2
    await supabase
      .from("ticket_types")
      .update({ sold: 9 })
      .eq("id", seed.ticketTypeId);

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(makeBody(seed));
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not enough tickets/i);
  });

  // ── Discount validation ─────────────────────────────────────────────────

  it("validates and applies a real discount code", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_discount",
      client_secret: "pi_discount_secret",
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(makeBody(seed, { discount_code: "INTTEST10" }));
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.discount).toBeDefined();
    expect(json.discount.code).toBe("INTTEST10");
    expect(json.discount.type).toBe("percentage");
    expect(json.discount.value).toBe(10);
    // 10% of £50 = £5
    expect(json.discount.amount).toBe(5);
    // 5000 - 500 = 4500 pence
    expect(json.amount).toBe(4500);
  });

  it("rejects a maxed-out discount code from real DB", async () => {
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(makeBody(seed, { discount_code: "INTMAXED" }));
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/usage limit/i);
  });

  // ── increment_discount_used RPC ─────────────────────────────────────────

  it("increment_discount_used RPC actually increments used_count in DB", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_rpc",
      client_secret: "pi_rpc_secret",
    });

    // Confirm used_count starts at 0
    const { data: before } = await supabase
      .from("discounts")
      .select("used_count")
      .eq("id", seed.discountId)
      .single();
    expect(before!.used_count).toBe(0);

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(makeBody(seed, { discount_code: "INTTEST10" }));
    const res = await POST(req);
    expect(res.status).toBe(200);

    // The RPC is fire-and-forget — wait briefly for it to complete
    await new Promise((r) => setTimeout(r, 1000));

    const { data: after } = await supabase
      .from("discounts")
      .select("used_count")
      .eq("id", seed.discountId)
      .single();
    expect(after!.used_count).toBe(1);
  });

  // ── Multi-ticket-type amount calculation ────────────────────────────────

  it("calculates correct total from multiple real ticket types", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_multi",
      client_secret: "pi_multi_secret",
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({
      event_id: seed.eventId,
      items: [
        { ticket_type_id: seed.ticketTypeId, qty: 1 },      // £25
        { ticket_type_id: seed.ticketTypeLargeId, qty: 2 },  // 2 × £50
      ],
      customer: {
        email: "integration@test.com",
        first_name: "Test",
        last_name: "Buyer",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    // £25 + (2 × £50) = £125 = 12500 pence
    expect(json.amount).toBe(12500);
  });
});
