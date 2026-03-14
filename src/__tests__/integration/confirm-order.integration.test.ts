/**
 * Integration tests for POST /api/stripe/confirm-order
 *
 * These tests hit the REAL Supabase database to verify:
 * - The increment_sold RPC correctly increments sold count
 * - Real rows are created in orders, order_items, tickets, customers
 * - Idempotency: same payment_ref doesn't create duplicates
 * - Correct org_id, event_id, line items, ticket codes on created rows
 * - Rollback: when a ticket type is sold out, already-incremented sold counts are rolled back
 *
 * Stripe stays mocked (no real charges). createOrder is REAL (not mocked).
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

const mockPaymentIntentsRetrieve = vi.fn();
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
  }),
  verifyConnectedAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/org", () => ({
  getOrgIdFromRequest: () => TEST_ORG_ID,
}));

vi.mock("@/lib/payment-monitor", () => ({
  logPaymentEvent: vi.fn(),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/meta", () => ({
  fetchMarketingSettings: vi.fn().mockResolvedValue(null),
  hashSHA256: vi.fn().mockReturnValue("hash"),
  sendMetaEvents: vi.fn().mockResolvedValue(null),
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

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/stripe/confirm-order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-org-id": TEST_ORG_ID },
    body: JSON.stringify(body),
  });
}

function makeSucceededPI(
  seed: SeedData,
  piId: string,
  overrides?: Record<string, unknown>
) {
  return {
    id: piId,
    status: "succeeded",
    amount: 5000, // 2 × £25 = 5000 pence
    currency: "gbp",
    metadata: {
      event_id: seed.eventId,
      event_slug: "test-integration-event",
      org_id: TEST_ORG_ID,
      customer_email: "integration@test.com",
      customer_first_name: "Test",
      customer_last_name: "Buyer",
      customer_phone: "",
      items_json: JSON.stringify([{ t: seed.ticketTypeId, q: 2 }]),
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/confirm-order — integration", () => {
  let seed: SeedData;

  beforeAll(async () => {
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

  // ── Creates real rows ───────────────────────────────────────────────────

  it("creates real order, order_items, tickets, and customer in the database", async () => {
    const piId = "pi_inttest_confirm_1";
    mockPaymentIntentsRetrieve.mockResolvedValue(makeSucceededPI(seed, piId));

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: piId });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.order_number).toBeDefined();

    // Verify order exists in DB with correct org_id and event_id
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
    expect(order!.payment_method).toBe("stripe");
    expect(order!.payment_ref).toBe(piId);

    // Verify order_items
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order!.id)
      .eq("org_id", TEST_ORG_ID);

    expect(orderItems).toHaveLength(1);
    expect(orderItems![0].ticket_type_id).toBe(seed.ticketTypeId);
    expect(orderItems![0].qty).toBe(2);
    expect(Number(orderItems![0].unit_price)).toBe(25);

    // Verify tickets (2 tickets for qty=2)
    const { data: tickets } = await supabase
      .from("tickets")
      .select("*")
      .eq("order_id", order!.id)
      .eq("org_id", TEST_ORG_ID);

    expect(tickets).toHaveLength(2);
    for (const ticket of tickets!) {
      expect(ticket.event_id).toBe(seed.eventId);
      expect(ticket.ticket_type_id).toBe(seed.ticketTypeId);
      expect(ticket.holder_email).toBe("integration@test.com");
      expect(ticket.ticket_code).toBeDefined();
      expect(ticket.ticket_code.length).toBeGreaterThan(0);
    }

    // Verify customer was created
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("org_id", TEST_ORG_ID)
      .eq("email", "integration@test.com")
      .single();

    expect(customer).not.toBeNull();
    expect(customer!.first_name).toBe("Test");
    expect(customer!.last_name).toBe("Buyer");
  });

  // ── increment_sold RPC ──────────────────────────────────────────────────

  it("increment_sold RPC increments sold count in the real ticket_types table", async () => {
    // Check sold count before
    const { data: before } = await supabase
      .from("ticket_types")
      .select("sold")
      .eq("id", seed.ticketTypeId)
      .single();
    expect(before!.sold).toBe(0);

    const piId = "pi_inttest_sold_1";
    mockPaymentIntentsRetrieve.mockResolvedValue(makeSucceededPI(seed, piId));

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: piId });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Check sold count after — should be incremented by 2
    const { data: after } = await supabase
      .from("ticket_types")
      .select("sold")
      .eq("id", seed.ticketTypeId)
      .single();
    expect(after!.sold).toBe(2);
  });

  // ── Idempotency ─────────────────────────────────────────────────────────

  it("idempotent: calling with same payment_ref twice does not create duplicate orders", async () => {
    const piId = "pi_inttest_idempotent";
    mockPaymentIntentsRetrieve.mockResolvedValue(makeSucceededPI(seed, piId));

    const { POST } = await import("@/app/api/stripe/confirm-order/route");

    // First call — creates order
    const res1 = await POST(makeRequest({ payment_intent_id: piId }));
    expect(res1.status).toBe(200);

    // Second call — should return existing order, not create a new one
    const res2 = await POST(makeRequest({ payment_intent_id: piId }));
    expect(res2.status).toBe(200);

    // Verify only 1 order exists with this payment_ref
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("payment_ref", piId)
      .eq("org_id", TEST_ORG_ID);

    expect(orders).toHaveLength(1);
  });

  // ── Rollback on sold-out ────────────────────────────────────────────────

  it("rolls back sold count when second ticket type is sold out", async () => {
    // Set VIP ticket to near capacity: capacity=1000, sold=999, request qty=2
    await supabase
      .from("ticket_types")
      .update({ sold: 999 })
      .eq("id", seed.ticketTypeLargeId);

    const piId = "pi_inttest_rollback";
    // Request both ticket types: GA (plenty of capacity) + VIP (will fail)
    mockPaymentIntentsRetrieve.mockResolvedValue({
      ...makeSucceededPI(seed, piId),
      metadata: {
        event_id: seed.eventId,
        event_slug: "test-integration-event",
        org_id: TEST_ORG_ID,
        customer_email: "rollback@test.com",
        customer_first_name: "Roll",
        customer_last_name: "Back",
        customer_phone: "",
        items_json: JSON.stringify([
          { t: seed.ticketTypeId, q: 2 },       // GA: should succeed then roll back
          { t: seed.ticketTypeLargeId, q: 2 },   // VIP: will fail (999 + 2 > 1000)
        ]),
      },
    });

    const { POST } = await import("@/app/api/stripe/confirm-order/route");
    const req = makeRequest({ payment_intent_id: piId });
    const res = await POST(req);

    // Should return 409 (sold out)
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/sold out/i);

    // GA sold count should be rolled back to 0 (not 2)
    const { data: gaSold } = await supabase
      .from("ticket_types")
      .select("sold")
      .eq("id", seed.ticketTypeId)
      .single();
    expect(gaSold!.sold).toBe(0);

    // No order should exist for this payment_ref
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("payment_ref", piId)
      .eq("org_id", TEST_ORG_ID);

    expect(orders).toHaveLength(0);
  });
});
