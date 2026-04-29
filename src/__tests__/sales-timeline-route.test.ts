import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — declared before importing the route
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
}));

const requireAuthMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => requireAuthMock(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/events/evt-1/sales-timeline",
    { method: "GET" }
  );
}

function buildEventChain(event: Record<string, unknown> | null) {
  // .select(...).eq(id).eq(org_id).single() → { data, error }
  const single = vi.fn().mockResolvedValue({
    data: event,
    error: event ? null : { message: "Not found" },
  });
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single,
  };
  // ts: ensure `eq` returns chain (mockReturnThis already does)
  return chain;
}

function buildTicketTypesChain(rows: Record<string, unknown>[]) {
  // .select(...).eq(org_id).eq(event_id).order(...) → { data, error }
  const final = Promise.resolve({ data: rows, error: null });
  const chain: Record<string, unknown> = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  (chain.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  (chain.order as ReturnType<typeof vi.fn>).mockReturnValue(final);
  return chain;
}

function buildOrderItemsChain(
  rows: Record<string, unknown>[],
  capture?: { eqCalls: { col: string; val: unknown }[]; gteCalls: unknown[]; lteCalls: unknown[] }
) {
  const final = Promise.resolve({ data: rows, error: null });
  const chain: Record<string, unknown> = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
  };
  // select returns chain
  (chain.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  // eq records the call and returns chain (so we can stack 3 of them)
  (chain.eq as ReturnType<typeof vi.fn>).mockImplementation((col, val) => {
    capture?.eqCalls.push({ col, val });
    return chain;
  });
  // gte/lte record + return final-resolvable chain
  (chain.gte as ReturnType<typeof vi.fn>).mockImplementation((_col, val) => {
    capture?.gteCalls.push(val);
    return chain;
  });
  (chain.lte as ReturnType<typeof vi.fn>).mockImplementation((_col, val) => {
    capture?.lteCalls.push(val);
    return chain;
  });
  // The route awaits the final chain — make every method return a thenable
  // for the last call. Easiest path: at the end, the chain itself is awaited.
  Object.defineProperty(chain, "then", {
    value: (
      resolve: (v: { data: unknown; error: unknown }) => void
    ) => {
      final.then(resolve);
    },
    configurable: true,
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/events/[id]/sales-timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({
      orgId: "test-org",
      user: { id: "user-1" },
      error: null,
    });
  });

  it("returns 401 when auth fails", async () => {
    const error401 = new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
    requireAuthMock.mockResolvedValue({ error: error401 });

    const { GET } = await import(
      "@/app/api/events/[id]/sales-timeline/route"
    );
    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the event isn't owned by the caller's org", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "events") return buildEventChain(null);
      return buildTicketTypesChain([]);
    });

    const { GET } = await import(
      "@/app/api/events/[id]/sales-timeline/route"
    );
    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(404);
  });

  it("scopes the order_items query by org_id, event_id, AND completed status", async () => {
    const capture = {
      eqCalls: [] as { col: string; val: unknown }[],
      gteCalls: [] as unknown[],
      lteCalls: [] as unknown[],
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return buildEventChain({
          id: "evt-1",
          currency: "GBP",
          org_id: "test-org",
        });
      }
      if (table === "ticket_types") {
        return buildTicketTypesChain([]);
      }
      if (table === "order_items") {
        return buildOrderItemsChain([], capture);
      }
      return buildTicketTypesChain([]);
    });

    const { GET } = await import(
      "@/app/api/events/[id]/sales-timeline/route"
    );
    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(200);

    // Three required filters: org_id, order.event_id, order.status='completed'.
    // (Refunded/cancelled orders are excluded — kept revenue, not gross.)
    expect(capture.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "org_id", val: "test-org" },
        { col: "order.event_id", val: "evt-1" },
        { col: "order.status", val: "completed" },
      ])
    );
  });

  it("buckets order_items by UTC date and per-ticket-type", async () => {
    const items = [
      {
        qty: 2,
        unit_price: 10,
        ticket_type_id: "tt-1",
        created_at: "2026-04-27T08:30:00Z",
        order: { id: "o1", event_id: "evt-1", status: "completed", currency: "GBP" },
      },
      {
        qty: 1,
        unit_price: 50,
        ticket_type_id: "tt-2",
        created_at: "2026-04-27T20:00:00Z",
        order: { id: "o1", event_id: "evt-1", status: "completed", currency: "GBP" },
      },
      {
        qty: 3,
        unit_price: 10,
        ticket_type_id: "tt-1",
        created_at: "2026-04-29T11:11:11Z",
        order: { id: "o2", event_id: "evt-1", status: "completed", currency: "GBP" },
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return buildEventChain({
          id: "evt-1",
          currency: "GBP",
          org_id: "test-org",
        });
      }
      if (table === "ticket_types") {
        return buildTicketTypesChain([
          { id: "tt-1", name: "GA", sold: 5, capacity: 100, sort_order: 0 },
          { id: "tt-2", name: "VIP", sold: 1, capacity: 20, sort_order: 1 },
        ]);
      }
      if (table === "order_items") {
        return buildOrderItemsChain(items);
      }
      return buildTicketTypesChain([]);
    });

    const { GET } = await import(
      "@/app/api/events/[id]/sales-timeline/route"
    );
    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    // 2026-04-27 to 2026-04-29 inclusive → 3 buckets after densification.
    expect(json.buckets).toHaveLength(3);
    expect(json.buckets[0].date).toBe("2026-04-27");
    expect(json.buckets[1].date).toBe("2026-04-28");
    expect(json.buckets[2].date).toBe("2026-04-29");

    // Day 0: GA qty 2 (rev 20) + VIP qty 1 (rev 50)
    expect(json.buckets[0].perTicket).toEqual({
      "tt-1": { qty: 2, revenue: 20 },
      "tt-2": { qty: 1, revenue: 50 },
    });
    // Day 1: zero-bucket from densification
    expect(json.buckets[1].perTicket).toEqual({});
    // Day 2: GA qty 3 (rev 30) only
    expect(json.buckets[2].perTicket).toEqual({
      "tt-1": { qty: 3, revenue: 30 },
    });

    // Ticket types come back in sort_order, with capacity preserved.
    expect(json.ticketTypes).toEqual([
      { id: "tt-1", name: "GA", sold: 5, capacity: 100, sort_order: 0 },
      { id: "tt-2", name: "VIP", sold: 1, capacity: 20, sort_order: 1 },
    ]);

    expect(json.currency).toBe("GBP");
    expect(typeof json.generatedAt).toBe("string");
  });

  it("returns an empty buckets array when there are no completed orders", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return buildEventChain({
          id: "evt-1",
          currency: "GBP",
          org_id: "test-org",
        });
      }
      if (table === "ticket_types") {
        return buildTicketTypesChain([
          { id: "tt-1", name: "GA", sold: 0, capacity: 100, sort_order: 0 },
        ]);
      }
      if (table === "order_items") {
        return buildOrderItemsChain([]);
      }
      return buildTicketTypesChain([]);
    });

    const { GET } = await import(
      "@/app/api/events/[id]/sales-timeline/route"
    );
    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.buckets).toEqual([]);
    expect(json.ticketTypes).toHaveLength(1);
  });

  it("ignores order_items missing a ticket_type_id", async () => {
    const items = [
      {
        qty: 1,
        unit_price: 100,
        ticket_type_id: null, // merch-only line
        created_at: "2026-04-27T08:30:00Z",
        order: { id: "o1", event_id: "evt-1", status: "completed", currency: "GBP" },
      },
      {
        qty: 1,
        unit_price: 25,
        ticket_type_id: "tt-1",
        created_at: "2026-04-27T08:30:00Z",
        order: { id: "o1", event_id: "evt-1", status: "completed", currency: "GBP" },
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return buildEventChain({
          id: "evt-1",
          currency: "GBP",
          org_id: "test-org",
        });
      }
      if (table === "ticket_types") {
        return buildTicketTypesChain([
          { id: "tt-1", name: "GA", sold: 1, capacity: 100, sort_order: 0 },
        ]);
      }
      if (table === "order_items") {
        return buildOrderItemsChain(items);
      }
      return buildTicketTypesChain([]);
    });

    const { GET } = await import(
      "@/app/api/events/[id]/sales-timeline/route"
    );
    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ id: "evt-1" }) });
    const json = await res.json();
    expect(json.buckets[0].perTicket).toEqual({
      "tt-1": { qty: 1, revenue: 25 },
    });
  });
});
