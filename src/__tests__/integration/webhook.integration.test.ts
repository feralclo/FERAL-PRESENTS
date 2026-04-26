/**
 * Integration tests for POST /api/stripe/webhook
 *
 * These tests hit the REAL Supabase database to verify:
 * - handlePaymentSuccess creates real order rows with valid metadata
 * - Idempotency: existing order with same payment_ref is detected and skipped
 * - Event lookup works correctly with real org_id filtering
 *
 * Stripe stays mocked. createOrder is REAL (not mocked).
 * Webhook runs in dev mode (no STRIPE_WEBHOOK_SECRET) so signature is not verified.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  TEST_ORG_ID,
  supabase,
  seedTestData,
  cleanupAllTestData,
  cleanupTransactionalData,
  resetSoldCounts,
  type SeedData,
} from "./setup";

// ---------------------------------------------------------------------------
// Mocks — Stripe + side effects. Supabase and createOrder are REAL.
// ---------------------------------------------------------------------------

// Mock constructEvent so it returns whatever was sent as the body — the
// route then proceeds as if Stripe verified the signature successfully.
// (Real signature verification needs Stripe's signing secret + a true HMAC,
// which integration tests don't have access to.)
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (body: string) => JSON.parse(body),
    },
    paymentIntents: {},
  }),
}));

vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => TEST_ORG_ID,
}));

vi.mock("@/lib/payment-monitor", () => ({
  logPaymentEvent: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/meta", () => ({
  fetchMarketingSettings: vi.fn().mockResolvedValue(null),
  hashSHA256: vi.fn().mockReturnValue("hash"),
  sendMetaEvents: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/plans", () => ({
  updateOrgPlanSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/rep-attribution", () => ({
  attributeSaleToRep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookRequest(body: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-org-id": TEST_ORG_ID,
      // verifyWebhookEvent bails out without a signature header. The mocked
      // constructEvent ignores the value — any non-empty string suffices.
      "stripe-signature": "test_sig_no_real_verification",
    },
    body,
  });
}

function makePaymentSucceededEvent(
  seed: SeedData,
  piId: string,
  overrides?: Record<string, unknown>
) {
  return {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: piId,
        amount: 5000,
        currency: "gbp",
        metadata: {
          event_id: seed.eventId,
          event_slug: "test-integration-event",
          org_id: TEST_ORG_ID,
          customer_email: "webhook@test.com",
          customer_first_name: "Webhook",
          customer_last_name: "Test",
          customer_phone: "",
          items_json: JSON.stringify([{ t: seed.ticketTypeId, q: 2 }]),
          ...overrides,
        },
        last_payment_error: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/webhook — integration", () => {
  let seed: SeedData;

  beforeAll(async () => {
    // Set a dummy secret so verifyWebhookEvent enters the verification loop.
    // The mocked constructEvent ignores the secret and just returns the
    // parsed body — i.e. pretends Stripe approved the signature.
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_integration_dummy";
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

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTransactionalData();
    await resetSoldCounts([seed.ticketTypeId, seed.ticketTypeLargeId]);
  });

  // ── Creates real order rows ─────────────────────────────────────────────

  it("handlePaymentSuccess creates real order rows in the database", async () => {
    const piId = "pi_webhook_inttest_1";
    const stripeEvent = makePaymentSucceededEvent(seed, piId);

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    // Verify order was created in DB
    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("payment_ref", piId)
      .eq("org_id", TEST_ORG_ID)
      .single();

    expect(order).not.toBeNull();
    expect(order!.org_id).toBe(TEST_ORG_ID);
    expect(order!.event_id).toBe(seed.eventId);
    expect(order!.status).toBe("completed");
    expect(order!.payment_ref).toBe(piId);

    // Verify tickets were created
    const { data: tickets } = await supabase
      .from("tickets")
      .select("*")
      .eq("order_id", order!.id)
      .eq("org_id", TEST_ORG_ID);

    expect(tickets).toHaveLength(2);
    for (const ticket of tickets!) {
      expect(ticket.holder_email).toBe("webhook@test.com");
      expect(ticket.ticket_code).toBeDefined();
    }

    // Verify sold count was incremented
    const { data: tt } = await supabase
      .from("ticket_types")
      .select("sold")
      .eq("id", seed.ticketTypeId)
      .single();

    expect(tt!.sold).toBe(2);
  });

  // ── Idempotency ─────────────────────────────────────────────────────────

  it("idempotent: existing order with same payment_ref is detected and skipped", async () => {
    const piId = "pi_webhook_idempotent";
    const stripeEvent = makePaymentSucceededEvent(seed, piId);
    const body = JSON.stringify(stripeEvent);

    const { POST } = await import("@/app/api/stripe/webhook/route");

    // First call — creates order
    const res1 = await POST(makeWebhookRequest(body));
    expect(res1.status).toBe(200);

    // Second call — should detect existing order and skip creation
    const res2 = await POST(makeWebhookRequest(body));
    expect(res2.status).toBe(200);

    // Only 1 order should exist
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("payment_ref", piId)
      .eq("org_id", TEST_ORG_ID);

    expect(orders).toHaveLength(1);

    // Sold count should be 2 (from first call only, not doubled)
    const { data: tt } = await supabase
      .from("ticket_types")
      .select("sold")
      .eq("id", seed.ticketTypeId)
      .single();

    expect(tt!.sold).toBe(2);
  });

  // ── Event lookup with org_id filtering ──────────────────────────────────

  it("event lookup works correctly with real org_id filtering", async () => {
    // Use a non-existent event_id — should NOT create an order
    const piId = "pi_webhook_noevent";
    const stripeEvent = makePaymentSucceededEvent(seed, piId, {
      event_id: "00000000-0000-0000-0000-000000000000",
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = makeWebhookRequest(JSON.stringify(stripeEvent));
    const res = await POST(req);

    // Webhook should return 200 (ack) but no order created
    expect(res.status).toBe(200);

    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("payment_ref", piId)
      .eq("org_id", TEST_ORG_ID);

    expect(orders).toHaveLength(0);
  });
});
