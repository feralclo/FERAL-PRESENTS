import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();

function createChain(data: unknown = null, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
  return chain;
}

let mockTicketData: Record<string, unknown> | null = null;
let mockTicketError: unknown = null;
let mockUpdateError: unknown = null;

const mockFrom = vi.fn().mockImplementation(() => {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockTicketData, error: mockTicketError }),
          in: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTicketData, error: mockTicketError }),
          }),
        }),
        single: vi.fn().mockResolvedValue({ data: mockTicketData, error: mockTicketError }),
        in: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockTicketData, error: mockTicketError }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: mockUpdateError }),
      }),
    }),
  };
});

const mockSupabase = { from: mockFrom };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue(mockSupabase),
}));

// Auth mock — returns test org
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "user-123", email: "test@test.com" },
    orgId: "test-org",
    error: null,
  }),
}));

// Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import routes AFTER mocks
// ---------------------------------------------------------------------------

const { POST: scanPost } = await import("@/app/api/tickets/[code]/scan/route");
const { POST: merchPost } = await import("@/app/api/tickets/[code]/merch/route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/tickets/TEST-001/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(code: string) {
  return { params: Promise.resolve({ code }) };
}

const VALID_TICKET = {
  id: "ticket-1",
  ticket_code: "TEST-GA-000001",
  status: "valid",
  event_id: "event-1",
  holder_first_name: "Alice",
  holder_last_name: "Johnson",
  holder_email: "alice@test.com",
  merch_size: null,
  merch_collected: false,
  scanned_at: null,
  scanned_by: null,
  ticket_type: { name: "General Admission" },
  event: { name: "Test Event", slug: "test-event", venue_name: "Test Venue", date_start: "2026-03-20" },
};

const USED_TICKET = {
  ...VALID_TICKET,
  status: "used",
  scanned_at: "2026-03-19T20:00:00Z",
  scanned_by: "scanner",
};

const MERCH_TICKET = {
  ...VALID_TICKET,
  ticket_code: "TEST-MERCH-001",
  merch_size: "L",
  ticket_type: { name: "VIP + Merch Bundle" },
};

const MERCH_ONLY_TICKET = {
  ...VALID_TICKET,
  ticket_code: "TEST-MERCHONLY-001",
  merch_size: "M",
  ticket_type: { name: "Merch Pre-order" },
};

const COLLECTED_MERCH_TICKET = {
  ...MERCH_TICKET,
  status: "used",
  merch_collected: true,
  merch_collected_at: "2026-03-19T21:00:00Z",
  merch_collected_by: "merch_desk",
};

// ---------------------------------------------------------------------------
// Entry Scan Tests
// ---------------------------------------------------------------------------

describe("POST /api/tickets/[code]/scan — Entry Scanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketData = null;
    mockTicketError = null;
    mockUpdateError = null;
  });

  it("approves valid ticket", async () => {
    mockTicketData = VALID_TICKET;
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-GA-000001")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe("valid");
    expect(json.ticket.holder_first_name).toBe("Alice");
    expect(json.ticket.ticket_type.name).toBe("General Admission");
  });

  it("rejects already-scanned ticket with 409", async () => {
    mockTicketData = USED_TICKET;
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-GA-000001")
    );
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.status).toBe("already_used");
    expect(json.scanned_at).toBe("2026-03-19T20:00:00Z");
  });

  it("rejects ticket from wrong event", async () => {
    mockTicketData = VALID_TICKET; // event_id = "event-1"
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-999" }),
      makeParams("TEST-GA-000001")
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.status).toBe("wrong_event");
  });

  it("rejects merch-only ticket at door", async () => {
    mockTicketData = MERCH_ONLY_TICKET;
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-MERCHONLY-001")
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.status).toBe("merch_only");
  });

  it("returns 404 for non-existent ticket", async () => {
    mockTicketData = null;
    mockTicketError = { message: "not found" };
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-1" }),
      makeParams("FAKE-TICKET")
    );
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.status).toBe("invalid");
  });

  it("rejects cancelled ticket", async () => {
    mockTicketData = { ...VALID_TICKET, status: "cancelled" };
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-GA-000001")
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("cancelled");
  });

  it("works without event_id for backward compatibility", async () => {
    mockTicketData = VALID_TICKET;
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner" }),
      makeParams("TEST-GA-000001")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("includes merch_size in response for tickets with merch", async () => {
    mockTicketData = MERCH_TICKET;
    const res = await scanPost(
      makeRequest({ scanned_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-MERCH-001")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ticket.merch_size).toBe("L");
  });
});

// ---------------------------------------------------------------------------
// Merch Collection Tests
// ---------------------------------------------------------------------------

describe("POST /api/tickets/[code]/merch — Merch Collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketData = null;
    mockTicketError = null;
    mockUpdateError = null;
  });

  it("collects merch for valid ticket", async () => {
    mockTicketData = MERCH_TICKET;
    const res = await merchPost(
      makeRequest({ collected_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-MERCH-001")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.merch_size).toBe("L");
  });

  it("rejects already-collected merch with 409", async () => {
    mockTicketData = COLLECTED_MERCH_TICKET;
    const res = await merchPost(
      makeRequest({ collected_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-MERCH-001")
    );
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.merch_size).toBe("L");
    expect(json.collected_at).toBeTruthy();
  });

  it("rejects ticket without merch", async () => {
    mockTicketData = VALID_TICKET; // no merch_size
    const res = await merchPost(
      makeRequest({ collected_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-GA-000001")
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("not include merchandise");
  });

  it("rejects merch from wrong event", async () => {
    mockTicketData = MERCH_TICKET; // event_id = "event-1"
    const res = await merchPost(
      makeRequest({ collected_by: "scanner", event_id: "event-999" }),
      makeParams("TEST-MERCH-001")
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("different event");
  });

  it("collects merch even if ticket not yet scanned for entry", async () => {
    // Friend's ticket scenario — valid status, has merch, never entered
    mockTicketData = MERCH_TICKET; // status: "valid"
    const res = await merchPost(
      makeRequest({ collected_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-MERCH-001")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("rejects cancelled ticket merch", async () => {
    mockTicketData = { ...MERCH_TICKET, status: "cancelled" };
    const res = await merchPost(
      makeRequest({ collected_by: "scanner", event_id: "event-1" }),
      makeParams("TEST-MERCH-001")
    );
    const json = await res.json();
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent ticket", async () => {
    mockTicketData = null;
    mockTicketError = { message: "not found" };
    const res = await merchPost(
      makeRequest({ collected_by: "scanner" }),
      makeParams("FAKE-TICKET")
    );
    expect(res.status).toBe(404);
  });
});
