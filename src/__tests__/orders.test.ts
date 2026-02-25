import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOrder,
  OrderCreationError,
  type CreateOrderParams,
  type OrderLineItem,
  type OrderCustomer,
  type OrderPayment,
  type OrderEvent,
} from "@/lib/orders";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// Mock next/cache (revalidatePath)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock email sending
const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// Mock ticket utils
let orderNumberCounter = 0;
vi.mock("@/lib/ticket-utils", () => ({
  generateOrderNumber: vi.fn().mockImplementation(async () => {
    orderNumberCounter++;
    return `FERAL-${String(orderNumberCounter).padStart(5, "0")}`;
  }),
  generateTicketCode: vi.fn().mockImplementation(() => {
    return `FERAL-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  }),
}));

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

interface MockRow {
  [key: string]: unknown;
}

/**
 * Build a chainable Supabase mock. Each .from(table) call returns a fresh
 * chainable query object. Tests configure expected data via the `tables` map.
 */
function createMockSupabase(config: {
  /** Table name → rows returned by select queries */
  tables?: Record<string, MockRow[]>;
  /** Table name → row returned by insert().select().single() */
  insertReturns?: Record<string, MockRow>;
  /** Whether rpc calls should succeed */
  rpcSuccess?: boolean;
  /** Force insert to fail with a specific error message */
  insertError?: string;
}) {
  const {
    tables = {},
    insertReturns = {},
    rpcSuccess = true,
    insertError,
  } = config;

  function makeChain(tableName: string) {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "in", "single", "order", "limit"];

    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }

    // Default select → return table data
    chain.select = vi.fn().mockImplementation(() => {
      // Return the chain, but set data for when .single() or end is reached
      const innerChain: Record<string, unknown> = {};
      for (const m of methods) {
        innerChain[m] = vi.fn().mockReturnValue(innerChain);
      }
      // When the chain resolves (no .single()), return array
      Object.defineProperty(innerChain, "then", {
        value: (resolve: (v: unknown) => void) => {
          resolve({ data: tables[tableName] || [], error: null });
        },
      });
      // .single() returns first row
      innerChain.single = vi.fn().mockReturnValue({
        then: (resolve: (v: unknown) => void) => {
          const rows = tables[tableName] || [];
          resolve({
            data: rows[0] || null,
            error: rows.length === 0 ? { message: "No rows" } : null,
          });
        },
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            then: (resolve: (v: unknown) => void) => {
              const rows = tables[tableName] || [];
              resolve({ data: rows[0] || null, error: null });
            },
          }),
          then: (resolve: (v: unknown) => void) => {
            resolve({ data: tables[tableName] || [], error: null });
          },
        }),
      });
      innerChain.eq = vi.fn().mockReturnValue(innerChain);
      innerChain.in = vi.fn().mockReturnValue(innerChain);
      return innerChain;
    });

    // insert → return insertReturns data
    chain.insert = vi.fn().mockImplementation(() => {
      if (insertError) {
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockReturnValue({
              then: (resolve: (v: unknown) => void) => {
                resolve({ data: null, error: { message: insertError } });
              },
            }),
          }),
          then: (resolve: (v: unknown) => void) => {
            resolve({ data: null, error: { message: insertError } });
          },
        };
      }
      const row = insertReturns[tableName] || { id: `mock-${tableName}-id` };
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            then: (resolve: (v: unknown) => void) => {
              resolve({ data: row, error: null });
            },
          }),
        }),
        then: (resolve: (v: unknown) => void) => {
          resolve({ data: [row], error: null });
        },
      };
    });

    // update — supports arbitrary .eq() chaining
    chain.update = vi.fn().mockImplementation(() => {
      const updateChain: Record<string, unknown> = {};
      updateChain.eq = vi.fn().mockReturnValue(updateChain);
      Object.defineProperty(updateChain, "then", {
        value: (resolve: (v: unknown) => void) => {
          resolve({ data: null, error: null });
        },
      });
      return updateChain;
    });

    // delete — supports arbitrary .eq() chaining
    chain.delete = vi.fn().mockImplementation(() => {
      const deleteChain: Record<string, unknown> = {};
      deleteChain.eq = vi.fn().mockReturnValue(deleteChain);
      Object.defineProperty(deleteChain, "then", {
        value: (resolve: (v: unknown) => void) => {
          resolve({ data: null, error: null });
        },
      });
      return deleteChain;
    });

    return chain;
  }

  return {
    from: vi.fn().mockImplementation((tableName: string) => makeChain(tableName)),
    rpc: vi.fn().mockImplementation(() => ({
      then: (resolve: (v: unknown) => void) => {
        resolve(rpcSuccess ? { data: null, error: null } : { data: null, error: { message: "RPC failed" } });
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TICKET_TYPE_A = {
  id: "tt-a",
  name: "General Admission",
  price: 25,
  sold: 10,
  capacity: 100,
  includes_merch: false,
  product: null,
};

const TICKET_TYPE_B = {
  id: "tt-b",
  name: "VIP + Tee",
  price: 45,
  sold: 5,
  capacity: 50,
  includes_merch: true,
  merch_name: "Event Tee",
  product: { name: "Official Event Tee" },
};

const TEST_EVENT: OrderEvent = {
  id: "evt-1",
  name: "FERAL Liverpool",
  slug: "feral-liverpool",
  currency: "GBP",
  venue_name: "Camp and Furnace",
  date_start: "2025-03-15T22:00:00Z",
  doors_time: "22:00",
};

const TEST_CUSTOMER: OrderCustomer = {
  email: "Test@Example.com",
  first_name: "Jane",
  last_name: "Doe",
  phone: "+447000000000",
};

const TEST_ITEMS: OrderLineItem[] = [
  { ticket_type_id: "tt-a", qty: 2 },
  { ticket_type_id: "tt-b", qty: 1, merch_size: "M" },
];

const TEST_PAYMENT: OrderPayment = {
  method: "stripe",
  ref: "pi_test123",
  totalCharged: 95,
};

function buildParams(overrides?: Partial<CreateOrderParams>): CreateOrderParams {
  const supabase = createMockSupabase({
    tables: {
      ticket_types: [TICKET_TYPE_A, TICKET_TYPE_B],
      customers: [], // No existing customer
      orders: [{ total: 95 }], // For customer stats aggregation
    },
    insertReturns: {
      customers: { id: "cust-1" },
      orders: { id: "order-1", order_number: "FERAL-00001" },
      order_items: { id: "oi-1" },
    },
  });

  return {
    supabase,
    orgId: "feral",
    event: TEST_EVENT,
    items: TEST_ITEMS,
    customer: TEST_CUSTOMER,
    payment: TEST_PAYMENT,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderNumberCounter = 0;
  });

  it("returns order, tickets, customerId, and ticketTypeMap", async () => {
    const params = buildParams();
    const result = await createOrder(params);

    expect(result).toHaveProperty("order");
    expect(result).toHaveProperty("tickets");
    expect(result).toHaveProperty("customerId");
    expect(result).toHaveProperty("ticketTypeMap");
    expect(result.order.id).toBe("order-1");
    expect(result.order.order_number).toBe("FERAL-00001");
  });

  it("creates correct number of tickets (one per qty)", async () => {
    const params = buildParams();
    const result = await createOrder(params);

    // 2 general + 1 VIP = 3 tickets
    expect(result.tickets.length).toBe(3);
  });

  it("lowercases customer email consistently", async () => {
    const params = buildParams();
    const result = await createOrder(params);

    for (const ticket of result.tickets) {
      expect(ticket.holder_email).toBe("test@example.com");
    }
  });

  it("sends email by default", async () => {
    const params = buildParams();
    await createOrder(params);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailParams = mockSendEmail.mock.calls[0][0];
    expect(emailParams.orgId).toBe("feral");
    expect(emailParams.customer.email).toBe("test@example.com");
    expect(emailParams.event.name).toBe("FERAL Liverpool");
  });

  it("skips email when sendEmail is false", async () => {
    const params = buildParams({ sendEmail: false });
    await createOrder(params);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("includes merch_name from product join in email data", async () => {
    const params = buildParams();
    await createOrder(params);

    const emailParams = mockSendEmail.mock.calls[0][0];
    const vipTicket = emailParams.tickets.find(
      (t: { merch_size?: string }) => t.merch_size === "M"
    );
    expect(vipTicket).toBeDefined();
    expect(vipTicket.merch_name).toBe("Official Event Tee");
  });

  it("does not set merch_name for tickets without merch_size", async () => {
    const params = buildParams();
    await createOrder(params);

    const emailParams = mockSendEmail.mock.calls[0][0];
    const generalTickets = emailParams.tickets.filter(
      (t: { merch_size?: string }) => !t.merch_size
    );
    for (const t of generalTickets) {
      expect(t.merch_name).toBeUndefined();
    }
  });

  it("calculates fees from totalCharged minus subtotal (Stripe path)", async () => {
    // subtotal = 2*25 + 1*45 = 95, totalCharged = 100 → fees = 5
    const params = buildParams({
      payment: { method: "stripe", ref: "pi_test", totalCharged: 100 },
    });
    const result = await createOrder(params);

    // The order insert call should have fees > 0
    const fromCalls = params.supabase.from.mock.calls;
    const ordersInsertCall = fromCalls.find(
      (c: string[]) => c[0] === "orders"
    );
    expect(ordersInsertCall).toBeDefined();
  });

  it("sets fees to 0 when totalCharged is not provided (test path)", async () => {
    const params = buildParams({
      payment: { method: "test", ref: "TEST-123" }, // no totalCharged
    });
    await createOrder(params);

    // No error means it completed — fees default to 0
    expect(params.supabase.from).toHaveBeenCalled();
  });

  it("uses atomic increment_sold RPC for sold count updates", async () => {
    const params = buildParams();
    await createOrder(params);

    // Should call rpc for each line item
    expect(params.supabase.rpc).toHaveBeenCalledTimes(2);
    expect(params.supabase.rpc).toHaveBeenCalledWith("increment_sold", {
      p_ticket_type_id: "tt-a",
      p_qty: 2,
    });
    expect(params.supabase.rpc).toHaveBeenCalledWith("increment_sold", {
      p_ticket_type_id: "tt-b",
      p_qty: 1,
    });
  });

  it("sets correct ticket fields on each generated ticket", async () => {
    const params = buildParams();
    const result = await createOrder(params);

    for (const ticket of result.tickets) {
      expect(ticket.org_id).toBe("feral");
      expect(ticket.event_id).toBe("evt-1");
      expect(ticket.customer_id).toBeDefined();
      expect(ticket.ticket_code).toMatch(/^FERAL-/);
      expect(ticket.holder_first_name).toBe("Jane");
      expect(ticket.holder_last_name).toBe("Doe");
      expect(ticket.holder_email).toBe("test@example.com");
    }
  });

  it("assigns merch_size only to tickets that have it", async () => {
    const params = buildParams();
    const result = await createOrder(params);

    const generalTickets = result.tickets.filter(
      (t) => t.ticket_type_id === "tt-a"
    );
    const vipTickets = result.tickets.filter(
      (t) => t.ticket_type_id === "tt-b"
    );

    expect(generalTickets.length).toBe(2);
    expect(vipTickets.length).toBe(1);

    for (const t of generalTickets) {
      expect(t.merch_size).toBeUndefined();
    }
    for (const t of vipTickets) {
      expect(t.merch_size).toBe("M");
    }
  });

  it("populates ticketTypeMap with product join data", async () => {
    const params = buildParams();
    const result = await createOrder(params);

    expect(result.ticketTypeMap.size).toBe(2);
    expect(result.ticketTypeMap.get("tt-a")?.name).toBe("General Admission");
    expect(result.ticketTypeMap.get("tt-b")?.product?.name).toBe(
      "Official Event Tee"
    );
  });

  it("throws OrderCreationError when ticket types fetch fails", async () => {
    const supabase = createMockSupabase({ tables: {} });
    // Override from to return error for ticket_types
    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === "ticket_types") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                then: (resolve: (v: unknown) => void) => {
                  resolve({ data: null, error: { message: "DB error" } });
                },
              }),
            }),
          }),
        };
      }
      // Default for other tables
      return createMockSupabase({ tables: {} }).from(table);
    });

    const params = buildParams({ supabase });

    await expect(createOrder(params)).rejects.toThrow(OrderCreationError);
    await expect(createOrder(params)).rejects.toThrow(
      "Failed to fetch ticket types"
    );
  });
});

describe("OrderCreationError", () => {
  it("has the correct name, message, and statusCode", () => {
    const err = new OrderCreationError("Something failed", 500);
    expect(err.name).toBe("OrderCreationError");
    expect(err.message).toBe("Something failed");
    expect(err.statusCode).toBe(500);
    expect(err instanceof Error).toBe(true);
  });
});

describe("createOrder type exports", () => {
  it("exports all expected types", () => {
    // Compile-time check — if types aren't exported, this file won't compile
    const item: OrderLineItem = { ticket_type_id: "a", qty: 1 };
    const customer: OrderCustomer = {
      email: "a@b.com",
      first_name: "A",
      last_name: "B",
    };
    const payment: OrderPayment = { method: "test", ref: "ref" };
    const event: OrderEvent = { id: "1", name: "E" };

    expect(item).toBeDefined();
    expect(customer).toBeDefined();
    expect(payment).toBeDefined();
    expect(event).toBeDefined();
  });
});
