import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks (declared via vi.hoisted so factory references resolve)
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockRequireRepAuth: vi.fn(),
  mockGetOrCreateRepDiscount: vi
    .fn()
    .mockResolvedValue({ id: "disc-1", code: "REP-ALEX123" }),
  mockFrom: vi.fn(),
}));
const { mockRequireRepAuth, mockGetOrCreateRepDiscount, mockFrom } = hoisted;

vi.mock("@/lib/auth", () => ({
  requireRepAuth: () => hoisted.mockRequireRepAuth(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: hoisted.mockFrom }),
}));
vi.mock("@/lib/discount-codes", () => ({
  getOrCreateRepDiscount: hoisted.mockGetOrCreateRepDiscount,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/rep-portal/quests/[id]/submit/route";

const QUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const EVENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const REP_ID = "770e8400-e29b-41d4-a716-446655440000";

function authOK() {
  mockRequireRepAuth.mockResolvedValueOnce({
    rep: {
      id: REP_ID,
      auth_user_id: "auth-1",
      email: "r@x.com",
      org_id: "feral",
      status: "active",
    },
    error: null,
  });
}

interface FromCall {
  table: string;
  /** Latest .insert payload (if any) */
  insertPayload?: Record<string, unknown>;
}

interface FixtureMap {
  quest?: Record<string, unknown>;
  rep_event?: Record<string, unknown> | null; // null = no row
  event?: Record<string, unknown>;
  rep_profile?: Record<string, unknown>;
  /** Per-rep submission count (for max_completions check) */
  submission_count?: number;
  /** Optional override: rep_event insert error */
  rep_event_insert_error?: { code?: string; message?: string } | null;
  /** Optional override: rep_quest_submissions insert error */
  submission_insert_error?: { message?: string } | null;
}

const fromCalls: FromCall[] = [];

function buildFromMock(fx: FixtureMap) {
  fromCalls.length = 0;
  return vi.fn((table: string) => {
    const call: FromCall = { table };
    fromCalls.push(call);

    const chain: Record<string, unknown> = {};
    const stub = () => chain;
    chain.select = stub;
    chain.eq = stub;
    chain.in = stub;
    chain.order = stub;
    chain.limit = stub;
    chain.insert = (payload: Record<string, unknown>) => {
      call.insertPayload = payload;
      return chain;
    };
    chain.single = () => {
      if (table === "rep_quests") {
        return Promise.resolve({
          data: fx.quest ?? null,
          error: fx.quest ? null : { message: "not found" },
        });
      }
      if (table === "rep_quest_submissions") {
        return Promise.resolve({
          data: { id: "sub-1", ...(call.insertPayload || {}) },
          error: fx.submission_insert_error ?? null,
        });
      }
      if (table === "rep_events") {
        return Promise.resolve({
          data: fx.rep_event ?? null,
          error: fx.rep_event_insert_error ?? null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };
    chain.maybeSingle = () => {
      if (table === "rep_events") {
        return Promise.resolve({ data: fx.rep_event ?? null, error: null });
      }
      if (table === "events") {
        return Promise.resolve({ data: fx.event ?? null, error: null });
      }
      if (table === "reps") {
        return Promise.resolve({ data: fx.rep_profile ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    // Head-only count for max_completions
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
      const isInsert = call.insertPayload !== undefined;
      if (isInsert && table === "rep_events") {
        resolve({ data: null, error: fx.rep_event_insert_error ?? null });
      } else if (table === "rep_quest_submissions") {
        resolve({ data: null, error: null, count: fx.submission_count ?? 0 });
      } else {
        resolve({ data: null, error: null });
      }
      return { catch: () => {} };
    };
    return chain;
  });
}

function makeRequest() {
  return new NextRequest("https://admin.entry.events/api/rep-portal/quests/" + QUEST_ID + "/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proof_type: "instagram_link",
      proof_url: "https://www.instagram.com/p/abc123/",
    }),
  });
}

const baseQuest = {
  id: QUEST_ID,
  org_id: "feral",
  status: "active",
  expires_at: null,
  starts_at: null,
  max_total: null,
  total_completed: 0,
  max_completions: null,
  proof_type: "instagram_link",
  event_id: EVENT_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrCreateRepDiscount.mockResolvedValue({ id: "disc-1", code: "REP-ALEX123" });
});

describe("POST /api/rep-portal/quests/[id]/submit — auto-join behaviour", () => {
  it("submits successfully when rep already has rep_events row (no auto-join)", async () => {
    authOK();
    const mock = buildFromMock({
      quest: baseQuest,
      rep_event: { id: "re-1" }, // already linked
    });
    vi.mocked(mockFrom).mockImplementation(mock);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: QUEST_ID }) });
    expect(res.status).toBe(201);

    // Auto-join helper must NOT be called when row already exists
    expect(mockGetOrCreateRepDiscount).not.toHaveBeenCalled();

    // Should not have inserted into rep_events
    const repEventInsert = fromCalls.find(
      (c) => c.table === "rep_events" && c.insertPayload,
    );
    expect(repEventInsert).toBeUndefined();
  });

  it("auto-creates rep_events with discount link when missing for a rep-enabled event", async () => {
    authOK();
    const mock = buildFromMock({
      quest: baseQuest,
      rep_event: null, // missing
      event: { id: EVENT_ID, rep_enabled: true, status: "live" },
      rep_profile: { first_name: "Alex", display_name: "Alex" },
    });
    vi.mocked(mockFrom).mockImplementation(mock);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: QUEST_ID }) });
    expect(res.status).toBe(201);

    // Discount helper called
    expect(mockGetOrCreateRepDiscount).toHaveBeenCalledOnce();
    const discountArg = mockGetOrCreateRepDiscount.mock.calls[0][0];
    expect(discountArg.repId).toBe(REP_ID);
    expect(discountArg.firstName).toBe("Alex");

    // rep_events row inserted with discount linkage
    const repEventInsert = fromCalls.find(
      (c) => c.table === "rep_events" && c.insertPayload,
    );
    expect(repEventInsert).toBeTruthy();
    expect(repEventInsert?.insertPayload).toMatchObject({
      org_id: "feral",
      rep_id: REP_ID,
      event_id: EVENT_ID,
      discount_id: "disc-1",
      sales_count: 0,
      revenue: 0,
    });
  });

  it("still 403s when event is not rep_enabled", async () => {
    authOK();
    const mock = buildFromMock({
      quest: baseQuest,
      rep_event: null,
      event: { id: EVENT_ID, rep_enabled: false, status: "live" },
    });
    vi.mocked(mockFrom).mockImplementation(mock);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: QUEST_ID }) });
    expect(res.status).toBe(403);
    expect(mockGetOrCreateRepDiscount).not.toHaveBeenCalled();

    // No rep_events insert
    const repEventInsert = fromCalls.find(
      (c) => c.table === "rep_events" && c.insertPayload,
    );
    expect(repEventInsert).toBeUndefined();
  });

  it("still 403s when event status is draft (not in published/active/live set)", async () => {
    authOK();
    const mock = buildFromMock({
      quest: baseQuest,
      rep_event: null,
      event: { id: EVENT_ID, rep_enabled: true, status: "draft" },
    });
    vi.mocked(mockFrom).mockImplementation(mock);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: QUEST_ID }) });
    expect(res.status).toBe(403);
  });

  it("tolerates a unique-constraint race on rep_events insert (treats 23505 as success)", async () => {
    authOK();
    const mock = buildFromMock({
      quest: baseQuest,
      rep_event: null,
      event: { id: EVENT_ID, rep_enabled: true, status: "live" },
      rep_profile: { first_name: "Alex" },
      rep_event_insert_error: { code: "23505", message: "duplicate" },
    });
    vi.mocked(mockFrom).mockImplementation(mock);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: QUEST_ID }) });
    // Submission still created — race lost but the row exists either way
    expect(res.status).toBe(201);
  });

  it("skips the rep_events check entirely for global (non-event) quests", async () => {
    authOK();
    const mock = buildFromMock({
      quest: { ...baseQuest, event_id: null },
    });
    vi.mocked(mockFrom).mockImplementation(mock);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: QUEST_ID }) });
    expect(res.status).toBe(201);
    expect(mockGetOrCreateRepDiscount).not.toHaveBeenCalled();
  });
});
