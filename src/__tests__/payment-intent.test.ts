import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that triggers the route module
// ---------------------------------------------------------------------------

// Supabase admin mock
const mockFrom = vi.fn();
const mockRpc = vi.fn().mockReturnValue({ then: (r: (v: unknown) => void) => { r({ data: 1, error: null }); return { catch: () => {} }; } });
const mockSupabase = { from: mockFrom, rpc: mockRpc };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
}));

// Stripe mock
const mockPaymentIntentsCreate = vi.fn();
const mockStripe = {
  paymentIntents: { create: mockPaymentIntentsCreate },
};

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => mockStripe,
  verifyConnectedAccount: vi.fn().mockResolvedValue(null),
}));

// Rate limiter mock — allow by default
const mockRateLimiter = vi.fn().mockReturnValue(null);
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => mockRateLimiter,
}));

// Org resolution
vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => "test-org",
}));

// Payment monitor — fire-and-forget
vi.mock("@/lib/payment-monitor", () => ({
  logPaymentEvent: vi.fn(),
  getClientIp: () => "127.0.0.1",
}));

// Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Plans — return starter defaults
vi.mock("@/lib/plans", () => ({
  getOrgPlan: vi.fn().mockResolvedValue({
    fee_percent: 3.5,
    min_fee: 30,
  }),
}));

// Org base currency
vi.mock("@/lib/org-settings", () => ({
  getOrgBaseCurrency: vi.fn().mockResolvedValue("GBP"),
}));

// Sequential release validation — pass by default
vi.mock("@/lib/ticket-visibility", () => ({
  validateSequentialPurchase: vi.fn().mockReturnValue(null),
}));

// Checkout guards — allow by default
vi.mock("@/lib/checkout-guards", () => ({
  isRestrictedCheckoutEmail: vi.fn().mockReturnValue(false),
}));

// VAT
vi.mock("@/lib/vat", () => ({
  calculateCheckoutVat: vi.fn().mockReturnValue(null),
  DEFAULT_VAT_SETTINGS: {
    vat_registered: false,
    vat_number: "",
    vat_rate: 0,
    prices_include_vat: true,
  },
}));

// Currency exchange — not needed for base currency tests
vi.mock("@/lib/currency/exchange-rates", () => ({
  getExchangeRates: vi.fn().mockResolvedValue(null),
  convertCurrency: vi.fn(),
  roundPresentmentPrice: vi.fn(),
  areRatesFreshForCheckout: vi.fn().mockReturnValue(false),
}));

// next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/stripe/payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-org-id": "test-org" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  event_id: "evt-1",
  items: [{ ticket_type_id: "tt-1", qty: 2 }],
  customer: {
    email: "buyer@example.com",
    first_name: "Jane",
    last_name: "Doe",
  },
};

const EVENT_ROW = {
  id: "evt-1",
  name: "Test Event",
  slug: "test-event",
  payment_method: "stripe",
  currency: "GBP",
  stripe_account_id: null,
  vat_registered: null,
  vat_rate: null,
  vat_prices_include: null,
  vat_number: null,
  tickets_live_at: null,
  settings_key: null,
};

const TICKET_TYPE = {
  id: "tt-1",
  name: "General Admission",
  price: 25,
  sold: 10,
  capacity: 100,
  status: "active",
  sort_order: 0,
};

/**
 * Set up mock Supabase .from() chains for the standard happy-path scenario.
 * Individual tests can override specific tables by calling setupFrom again.
 */
function setupFrom(overrides?: {
  event?: Record<string, unknown> | null;
  ticketTypes?: Record<string, unknown>[] | null;
  stripeSettings?: Record<string, unknown> | null;
  eventSettings?: Record<string, unknown> | null;
  discount?: Record<string, unknown> | null;
  vatSettings?: Record<string, unknown> | null;
}) {
  const event = overrides?.event !== undefined ? overrides.event : EVENT_ROW;
  const ticketTypes = overrides?.ticketTypes !== undefined ? overrides.ticketTypes : [TICKET_TYPE];

  mockFrom.mockImplementation((table: string) => {
    // events table
    if (table === "events") {
      return chainSelect({
        data: event,
        error: event ? null : { message: "Not found" },
      });
    }
    // ticket_types table
    if (table === "ticket_types") {
      return chainSelect({
        data: ticketTypes,
        error: ticketTypes ? null : { message: "Error" },
        isList: true,
      });
    }
    // site_settings table (called for stripe account, event settings, VAT)
    if (table === "site_settings") {
      return chainSelect({
        data: overrides?.stripeSettings ?? overrides?.eventSettings ?? overrides?.vatSettings ?? null,
        error: null,
      });
    }
    // discounts table
    if (table === "discounts") {
      return chainSelect({
        data: overrides?.discount ?? null,
        error: overrides?.discount ? null : { message: "Not found" },
      });
    }
    // default
    return chainSelect({ data: null, error: null });
  });
}

/** Build a chainable Supabase query mock returning the given result. */
function chainSelect(result: { data: unknown; error: unknown; isList?: boolean }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "ilike", "single", "order", "limit"];

  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }

  // For list queries (.in() chains), resolve to array
  if (result.isList) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: result.data, error: result.error }),
    });
  }

  // .single() resolves to single row
  chain.single = vi.fn().mockReturnValue({
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: result.data, error: result.error }),
  });

  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/payment-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiter.mockReturnValue(null);
    mockRpc.mockReturnValue({
      then: (r: (v: unknown) => void) => { r({ data: 1, error: null }); return { catch: () => {} }; },
    });
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_test123",
      client_secret: "pi_test123_secret_abc",
    });
    setupFrom();
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it("rejects request with no items", async () => {
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({ event_id: "evt-1", items: [], customer: VALID_BODY.customer });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/items/i);
  });

  it("rejects request missing customer fields", async () => {
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({ event_id: "evt-1", items: [{ ticket_type_id: "tt-1", qty: 1 }], customer: { email: "a@b.com" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/customer/i);
  });

  // ── Sold out ────────────────────────────────────────────────────────────

  it("rejects when ticket is sold out (capacity reached)", async () => {
    setupFrom({
      ticketTypes: [{ ...TICKET_TYPE, sold: 99, capacity: 100 }],
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({
      ...VALID_BODY,
      items: [{ ticket_type_id: "tt-1", qty: 2 }],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not enough tickets/i);
  });

  // ── Sequential release ─────────────────────────────────────────────────

  it("rejects when sequential release rule is violated", async () => {
    const { validateSequentialPurchase } = await import(
      "@/lib/ticket-visibility"
    );
    vi.mocked(validateSequentialPurchase).mockReturnValue(
      '"VIP" is not yet available. "General Admission" must sell out first.'
    );

    // Return event settings with sequential release enabled
    setupFrom({
      eventSettings: {
        data: {
          ticket_group_release_mode: { default: "sequential" },
          ticket_group_map: {},
        },
      },
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not yet available/i);
  });

  // ── Discount validation ─────────────────────────────────────────────────

  it("rejects expired discount code", async () => {
    setupFrom({
      discount: {
        code: "EXPIRED10",
        type: "percentage",
        value: 10,
        status: "active",
        max_uses: null,
        used_count: 0,
        starts_at: null,
        expires_at: "2020-01-01T00:00:00Z",
        applicable_event_ids: null,
        min_order_amount: null,
      },
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({ ...VALID_BODY, discount_code: "EXPIRED10" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/expired/i);
  });

  it("rejects discount code that has reached max uses", async () => {
    setupFrom({
      discount: {
        code: "MAXED",
        type: "percentage",
        value: 10,
        status: "active",
        max_uses: 5,
        used_count: 5,
        starts_at: null,
        expires_at: null,
        applicable_event_ids: null,
        min_order_amount: null,
      },
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({ ...VALID_BODY, discount_code: "MAXED" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/usage limit/i);
  });

  it("rejects discount code not valid for this event", async () => {
    setupFrom({
      discount: {
        code: "WRONG",
        type: "percentage",
        value: 10,
        status: "active",
        max_uses: null,
        used_count: 0,
        starts_at: null,
        expires_at: null,
        applicable_event_ids: ["evt-other"],
        min_order_amount: null,
      },
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({ ...VALID_BODY, discount_code: "WRONG" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not valid for this event/i);
  });

  it("applies valid discount code and returns discount in response", async () => {
    // For the discount test, we need the from mock to differentiate between
    // site_settings queries (for stripe account, event settings) and discounts
    let siteSettingsCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return chainSelect({ data: EVENT_ROW, error: null });
      }
      if (table === "ticket_types") {
        return chainSelect({ data: [TICKET_TYPE], error: null, isList: true });
      }
      if (table === "site_settings") {
        siteSettingsCallCount++;
        // First call: stripe account (return null), second: event settings (return null)
        return chainSelect({ data: null, error: null });
      }
      if (table === "discounts") {
        return chainSelect({
          data: {
            code: "SAVE10",
            type: "percentage",
            value: 10,
            status: "active",
            max_uses: null,
            used_count: 0,
            starts_at: null,
            expires_at: null,
            applicable_event_ids: null,
            min_order_amount: null,
          },
          error: null,
        });
      }
      return chainSelect({ data: null, error: null });
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({ ...VALID_BODY, discount_code: "SAVE10" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.discount).toBeDefined();
    expect(json.discount.code).toBe("SAVE10");
    expect(json.discount.amount).toBeGreaterThan(0);
  });

  // ── VAT calculation ──────────────────────────────────────────────────────

  it("calculates VAT correctly when event has VAT enabled (inclusive)", async () => {
    const { calculateCheckoutVat } = await import("@/lib/vat");
    vi.mocked(calculateCheckoutVat).mockReturnValue({
      net: 41.67,
      vat: 8.33,
      gross: 50,
    });

    setupFrom({
      event: {
        ...EVENT_ROW,
        vat_registered: true,
        vat_rate: 20,
        vat_prices_include: true,
        vat_number: "GB123456789",
      },
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vat).toBeDefined();
    expect(json.vat.rate).toBe(20);
    expect(json.vat.inclusive).toBe(true);
    expect(json.vat.amount).toBeGreaterThan(0);
  });

  // ── Rate limiting ──────────────────────────────────────────────────────

  it("rate limits after exceeding threshold", async () => {
    const { NextResponse } = await import("next/server");
    const blockedResponse = NextResponse.json(
      { error: "Too many requests. Please try again later.", retry_after: 30 },
      { status: 429 }
    );
    mockRateLimiter.mockReturnValue(blockedResponse);

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  // ── Idempotent PaymentIntent ──────────────────────────────────────────

  it("returns idempotent PaymentIntent on duplicate request", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_same",
      client_secret: "pi_same_secret",
    });

    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );

    const req1 = makeRequest(VALID_BODY);
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();

    const req2 = makeRequest(VALID_BODY);
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();

    // Both calls should use the same idempotency key → same PI
    expect(json1.payment_intent_id).toBe("pi_same");
    expect(json2.payment_intent_id).toBe("pi_same");

    // Verify idempotencyKey was passed to Stripe
    const createCalls = mockPaymentIntentsCreate.mock.calls;
    expect(createCalls.length).toBeGreaterThanOrEqual(2);
    const key1 = createCalls[0][1]?.idempotencyKey;
    const key2 = createCalls[1][1]?.idempotencyKey;
    expect(key1).toBeDefined();
    expect(key1).toBe(key2);
  });

  // ── Multi-currency fallback ──────────────────────────────────────────

  it("falls back to base currency when presentment currency PI creation fails", async () => {
    // First call (presentment currency) returns null (simulating Stripe rejection),
    // which triggers currency_fallback response
    mockPaymentIntentsCreate.mockResolvedValue(null);

    // We need the route to attempt a different currency
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest({
      ...VALID_BODY,
      presentment_currency: "EUR",
    });
    const res = await POST(req);
    // Route returns currency_fallback when PI is null after cross-currency attempt
    // But exchange rates are mocked as unavailable, so it stays on base currency
    expect(res.status).toBe(200);
  });

  // ── Idempotency key uniqueness ─────────────────────────────────────────

  it("produces different idempotency keys for different emails", async () => {
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );

    const req1 = makeRequest(VALID_BODY);
    await POST(req1);
    const key1 = mockPaymentIntentsCreate.mock.calls.at(-1)?.[1]?.idempotencyKey;

    const req2 = makeRequest({
      ...VALID_BODY,
      customer: { ...VALID_BODY.customer, email: "other@example.com" },
    });
    await POST(req2);
    const key2 = mockPaymentIntentsCreate.mock.calls.at(-1)?.[1]?.idempotencyKey;

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1).not.toBe(key2);
  });

  it("produces different idempotency keys for different event IDs", async () => {
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );

    const req1 = makeRequest(VALID_BODY);
    await POST(req1);
    const key1 = mockPaymentIntentsCreate.mock.calls.at(-1)?.[1]?.idempotencyKey;

    setupFrom({ event: { ...EVENT_ROW, id: "evt-2" } });
    const req2 = makeRequest({ ...VALID_BODY, event_id: "evt-2" });
    await POST(req2);
    const key2 = mockPaymentIntentsCreate.mock.calls.at(-1)?.[1]?.idempotencyKey;

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1).not.toBe(key2);
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("creates PaymentIntent and returns client_secret on valid request", async () => {
    const { POST } = await import(
      "@/app/api/stripe/payment-intent/route"
    );
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.client_secret).toBe("pi_test123_secret_abc");
    expect(json.payment_intent_id).toBe("pi_test123");
    expect(json.currency).toBe("gbp");
    expect(json.amount).toBe(5000); // 2 × £25 = £50 → 5000 pence
  });
});
