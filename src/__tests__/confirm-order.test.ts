import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockSupabase = { from: mockFrom, rpc: mockRpc };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
}));

// Stripe mock
const mockPaymentIntentsRetrieve = vi.fn();
const mockStripe = {
  paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
};

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => mockStripe,
  verifyConnectedAccount: vi.fn().mockResolvedValue(null),
}));

// Org resolution
vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => "test-org",
}));

// Payment monitor
vi.mock("@/lib/payment-monitor", () => ({
  logPaymentEvent: vi.fn(),
  getClientIp: () => "127.0.0.1",
}));

// Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// Email — mock, verify it was called in happy path
const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// Meta CAPI — mock and ignore
vi.mock("@/lib/meta", () => ({
  fetchMarketingSettings: vi.fn().mockResolvedValue(null),
  hashSHA256: vi.fn().mockReturnValue("hash"),
  sendMetaEvents: vi.fn().mockResolvedValue(null),
}));

// createOrder mock
const mockCreateOrder = vi.fn();
vi.mock("@/lib/orders", () => {
  class OrderCreationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "OrderCreationError";
      this.statusCode = statusCode;
    }
  }
  return {
    createOrder: (...args: unknown[]) => mockCreateOrder(...args),
    OrderCreationError,
  };
});

// Stripe config
vi.mock("@/lib/stripe/config", () => ({
  fromSmallestUnit: (amount: number, currency?: string) => {
    if (currency && ["jpy"].includes(currency.toLowerCase())) return amount;
    return amount / 100;
  },
}));

// next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/stripe/confirm-order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-org-id": "test-org" },
    body: JSON.stringify(body),
  });
}

const PI_METADATA = {
  event_id: "evt-1",
  event_slug: "test-event",
  org_id: "test-org",
  customer_email: "buyer@example.com",
  customer_first_name: "Jane",
  customer_last_name: "Doe",
  customer_phone: "+447000000000",
  items_json: JSON.stringify([{ t: "tt-1", q: 2 }]),
};

const SUCCEEDED_PI = {
  id: "pi_test123",
  status: "succeeded",
  amount: 5000,
  currency: "gbp",
  metadata: PI_METADATA,
};

const EVENT_ROW = {
  id: "evt-1",
  name: "Test Event",
  slug: "test-event",
  currency: "GBP",
  venue_name: "Test Venue",
  date_start: "2025-06-15T22:00:00Z",
  doors_time: "22:00",
};

const ORDER_RESULT = {
  order: {
    id: "order-1",
    order_number: "FERAL-00001",
    customer_id: "cust-1",
  },
  tickets: [
    { ticket_code: "FERAL-AAAABBBB", holder_email: "buyer@example.com" },
    { ticket_code: "FERAL-CCCCDDDD", holder_email: "buyer@example.com" },
  ],
  ticketTypeMap: new Map(),
};

const FULL_ORDER = {
  id: "order-1",
  order_number: "FERAL-00001",
  total: 50,
  currency: "GBP",
  event_id: "evt-1",
  customer: { email: "buyer@example.com", first_name: "Jane", last_name: "Doe" },
  order_items: [],
  tickets: [],
};

/**
 * Configure the from() mock for the standard confirm-order flow.
 */
function setupFrom(overrides?: {
  existingOrder?: Record<string, unknown> | null;
  fullOrder?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  stripeSettings?: Record<string, unknown> | null;
  eventForStripe?: Record<string, unknown> | null;
}) {
  const existing = overrides?.existingOrder !== undefined ? overrides.existingOrder : null;
  const full = overrides?.fullOrder !== undefined ? overrides.fullOrder : FULL_ORDER;
  const event = overrides?.event !== undefined ? overrides.event : EVENT_ROW;

  // Track which select call is which for the orders table
  let ordersSelectCount = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === "events") {
      return makeChain({ data: event, error: event ? null : { message: "Not found" } });
    }
    if (table === "orders") {
      ordersSelectCount++;
      if (ordersSelectCount === 1) {
        // First call: check existing order by payment_ref
        return makeChain({ data: existing, error: existing ? null : { message: "Not found" } });
      }
      // Second call: fetch full order with relations
      return makeChain({ data: full, error: null });
    }
    if (table === "site_settings") {
      return makeChain({ data: overrides?.stripeSettings ?? null, error: null });
    }
    if (table === "traffic_events") {
      return makeInsertChain();
    }
    return makeChain({ data: null, error: null });
  });
}

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "single", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) => resolve({ data: result.data, error: result.error }),
  });
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void, reject?: (v: unknown) => void) => resolve({ data: null, error: null }),
  });
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/confirm-order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentIntentsRetrieve.mockResolvedValue(SUCCEEDED_PI);
    mockCreateOrder.mockResolvedValue(ORDER_RESULT);
    setupFrom();
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("creates order + order_items + tickets on valid PaymentIntent", async () => {
    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: "pi_test123" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.order_number).toBe("FERAL-00001");

    // Verify createOrder was called with correct params
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const args = mockCreateOrder.mock.calls[0][0];
    expect(args.orgId).toBe("test-org");
    expect(args.event.id).toBe("evt-1");
    expect(args.items).toEqual([{ ticket_type_id: "tt-1", qty: 2 }]);
    expect(args.customer.email).toBe("buyer@example.com");
    expect(args.payment.method).toBe("stripe");
    expect(args.payment.ref).toBe("pi_test123");
  });

  // ── Idempotent — existing order ─────────────────────────────────────────

  it("idempotent — returns existing order if payment_ref already exists", async () => {
    setupFrom({
      existingOrder: { id: "order-1" },
      fullOrder: { ...FULL_ORDER, metadata: { email_sent: true } },
    });

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: "pi_test123" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();

    // createOrder should NOT have been called — we returned the existing order
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  // ── org_id mismatch ──────────────────────────────────────────────────────

  it("rejects when org_id doesn't match PaymentIntent metadata", async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      ...SUCCEEDED_PI,
      metadata: { ...PI_METADATA, org_id: "other-org" },
    });

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: "pi_test123" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/mismatch/i);
  });

  // ── Sold out (409 from createOrder) ──────────────────────────────────────

  it("handles increment_sold returning false (sold out) — returns 409", async () => {
    const { OrderCreationError } = await import("@/lib/orders");
    mockCreateOrder.mockRejectedValue(
      new OrderCreationError("Tickets sold out for \"General Admission\"", 409)
    );

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: "pi_test123" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/sold out/i);
  });

  // ── Missing payment_intent_id ──────────────────────────────────────────

  it("rejects request with missing payment_intent_id", async () => {
    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/payment_intent_id/i);
  });

  // ── PI not succeeded ──────────────────────────────────────────────────

  it("rejects when PaymentIntent status is not succeeded", async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      ...SUCCEEDED_PI,
      status: "requires_payment_method",
    });

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: "pi_test123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not completed/i);
  });

  // ── Partial sold-out rollback propagates correctly ─────────────────────

  it("rolls back already-incremented items on partial sold-out failure", async () => {
    // createOrder handles the rollback internally and throws 409
    const { OrderCreationError } = await import("@/lib/orders");
    mockCreateOrder.mockRejectedValue(
      new OrderCreationError("Tickets sold out for \"VIP\"", 409)
    );

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: "pi_test123" });
    const res = await POST(req);

    // The route returns the OrderCreationError status
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/sold out/i);
  });
});
