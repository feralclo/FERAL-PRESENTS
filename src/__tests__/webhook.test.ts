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
const mockConstructEvent = vi.fn();
const mockStripe = {
  webhooks: { constructEvent: mockConstructEvent },
  paymentIntents: {},
};

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => mockStripe,
}));

// Org resolution
vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => "test-org",
}));

// Payment monitor
const mockLogPaymentEvent = vi.fn();
vi.mock("@/lib/payment-monitor", () => ({
  logPaymentEvent: (...args: unknown[]) => mockLogPaymentEvent(...args),
}));

// Sentry
const mockCaptureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Email
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
const MockOrderCreationError = class extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "OrderCreationError";
    this.statusCode = statusCode;
  }
};

vi.mock("@/lib/orders", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  OrderCreationError: MockOrderCreationError,
}));

// Plans (for subscription lifecycle events)
const mockUpdateOrgPlanSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/plans", () => ({
  updateOrgPlanSettings: (...args: unknown[]) => mockUpdateOrgPlanSettings(...args),
}));

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

function makeWebhookRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-org-id": "test-org",
  };
  if (signature) {
    headers["stripe-signature"] = signature;
  }
  return new NextRequest("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

function makeStripeEvent(type: string, dataObject: Record<string, unknown>, account?: string) {
  return {
    type,
    data: { object: dataObject },
    ...(account ? { account } : {}),
  };
}

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

function setupFrom(overrides?: {
  existingOrder?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  orderTickets?: Record<string, unknown>[] | null;
}) {
  const existing = overrides?.existingOrder !== undefined ? overrides.existingOrder : null;
  const event = overrides?.event !== undefined ? overrides.event : EVENT_ROW;
  const orderTickets = overrides?.orderTickets !== undefined ? overrides.orderTickets : [];

  mockFrom.mockImplementation((table: string) => {
    if (table === "orders") {
      return makeChain({
        singleData: existing,
        singleError: existing ? null : { message: "Not found" },
      });
    }
    if (table === "events") {
      return makeChain({
        singleData: event,
        singleError: event ? null : { message: "Not found" },
      });
    }
    if (table === "tickets") {
      return makeListChain({ data: orderTickets, error: null });
    }
    if (table === "traffic_events") {
      return makeInsertChain();
    }
    return makeChain({ singleData: null, singleError: null });
  });
}

function makeChain(result: { singleData: unknown; singleError: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: result.singleData, error: result.singleError }),
  });
  return chain;
}

function makeListChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, "then", {
    value: (resolve: (v: unknown) => void) =>
      resolve({ data: result.data, error: result.error }),
  });
  chain.single = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: result.data, error: result.error }),
  });
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  });
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Tests — Event handling (dev mode: no signature verification)
// ---------------------------------------------------------------------------

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOrder.mockResolvedValue(ORDER_RESULT);
    setupFrom();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  });

  it("creates order on payment_intent.succeeded (happy path)", async () => {
    const stripeEvent = makeStripeEvent("payment_intent.succeeded", {
      id: "pi_test123",
      amount: 5000,
      currency: "gbp",
      metadata: PI_METADATA,
      last_payment_error: null,
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const args = mockCreateOrder.mock.calls[0][0];
    expect(args.orgId).toBe("test-org");
    expect(args.event.id).toBe("evt-1");
    expect(args.items).toEqual([{ ticket_type_id: "tt-1", qty: 2 }]);
    expect(args.payment.ref).toBe("pi_test123");
  });

  it("skips order creation if order already exists (idempotent)", async () => {
    setupFrom({
      existingOrder: {
        id: "order-1",
        order_number: "FERAL-00001",
        total: 50,
        currency: "GBP",
        event_id: "evt-1",
        metadata: { email_sent: true },
      },
    });

    const stripeEvent = makeStripeEvent("payment_intent.succeeded", {
      id: "pi_test123",
      amount: 5000,
      currency: "gbp",
      metadata: PI_METADATA,
      last_payment_error: null,
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("logs critical orphan when order creation fails with non-409 error", async () => {
    mockCreateOrder.mockRejectedValue(new Error("Database connection lost"));

    const stripeEvent = makeStripeEvent("payment_intent.succeeded", {
      id: "pi_orphan",
      amount: 5000,
      currency: "gbp",
      metadata: PI_METADATA,
      last_payment_error: null,
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("logs sold_out_after_payment when order creation fails with 409", async () => {
    mockCreateOrder.mockRejectedValue(
      new MockOrderCreationError("Tickets sold out for \"General Admission\"", 409)
    );

    const stripeEvent = makeStripeEvent("payment_intent.succeeded", {
      id: "pi_soldout",
      amount: 5000,
      currency: "gbp",
      metadata: PI_METADATA,
      last_payment_error: null,
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);

    expect(mockLogPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "checkout_error",
        severity: "critical",
        errorCode: "sold_out_after_payment",
        stripePaymentIntentId: "pi_soldout",
      })
    );
  });

  it("handles payment_intent.payment_failed — logs event", async () => {
    const stripeEvent = makeStripeEvent("payment_intent.payment_failed", {
      id: "pi_failed",
      amount: 5000,
      currency: "gbp",
      metadata: PI_METADATA,
      last_payment_error: {
        message: "Your card was declined",
        code: "card_declined",
        decline_code: "insufficient_funds",
      },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);

    expect(mockLogPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_failed",
        stripePaymentIntentId: "pi_failed",
        errorCode: "insufficient_funds",
      })
    );

    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated", async () => {
    const stripeEvent = makeStripeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "past_due",
      metadata: { org_id: "tenant-org" },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockUpdateOrgPlanSettings).toHaveBeenCalledWith("tenant-org", {
      subscription_status: "past_due",
    });
  });

  it("handles customer.subscription.deleted — downgrades to Starter", async () => {
    const stripeEvent = makeStripeEvent("customer.subscription.deleted", {
      id: "sub_456",
      status: "canceled",
      metadata: { org_id: "tenant-org" },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockUpdateOrgPlanSettings).toHaveBeenCalledWith("tenant-org", {
      plan_id: "starter",
      subscription_status: "canceled",
      stripe_subscription_id: undefined,
      current_period_end: undefined,
    });
  });

  it("acknowledges unhandled event types with 200", async () => {
    const stripeEvent = makeStripeEvent("charge.refunded", {
      id: "ch_123",
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Signature verification — isolated describe to avoid mock pollution
// This MUST be the last describe block because vi.resetModules() + vi.doMock()
// replaces the hoisted vi.mock() registrations for subsequent imports.
// ---------------------------------------------------------------------------

describe("POST /api/stripe/webhook — signature verification", () => {
  it("rejects invalid signature when STRIPE_WEBHOOK_SECRET is set", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

    vi.resetModules();

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripe: () => ({
        webhooks: {
          constructEvent: () => {
            throw new Error("Signature verification failed");
          },
        },
      }),
    }));
    vi.doMock("@/lib/org", () => ({ getOrgIdFromRequest: () => "test-org" }));
    vi.doMock("@/lib/payment-monitor", () => ({
      logPaymentEvent: mockLogPaymentEvent,
    }));
    vi.doMock("@sentry/nextjs", () => ({
      captureException: mockCaptureException,
    }));
    vi.doMock("@/lib/email", () => ({
      sendOrderConfirmationEmail: mockSendEmail,
    }));
    vi.doMock("@/lib/meta", () => ({
      fetchMarketingSettings: vi.fn().mockResolvedValue(null),
      hashSHA256: vi.fn().mockReturnValue("hash"),
      sendMetaEvents: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/lib/orders", () => ({
      createOrder: mockCreateOrder,
      OrderCreationError: MockOrderCreationError,
    }));
    vi.doMock("@/lib/plans", () => ({
      updateOrgPlanSettings: mockUpdateOrgPlanSettings,
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      fromSmallestUnit: (amount: number) => amount / 100,
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest("{}", "sig_invalid");
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid signature/i);

    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  });
});
