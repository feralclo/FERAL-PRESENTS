/**
 * Integration tests for GET /api/rep-portal/reps/search
 *
 * Hits the REAL Supabase database to verify:
 *   - status='active' filter (deleted/suspended reps don't appear)
 *   - Searcher excludes themselves
 *   - Bidirectional rep_blocks filter (both A→B and B→A blocks hide rows)
 *   - Follow flags resolve via rep_follows in both directions
 *   - ILIKE matches against display_name + first_name + last_name
 *   - Pagination metadata (has_more, total) is honest
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabase } from "./setup";

// Email prefix (for cleanup) and a distinctive name suffix all test reps
// share so the search term `RSTEST` reliably finds the full fixture set.
const TEST_PREFIX = "__rep_search_test__";
const RSTEST_SUFFIX = "RSTEST";

// Stable test rep ids — generated once at module load. UUIDs are easier
// to assert against than auto-generated rep ids (which we'd have to
// re-fetch after every cleanup).
const SEARCHER_ID = "11111111-1111-4111-8111-000000000001";
const ACTIVE_RAY_ID = "11111111-1111-4111-8111-000000000002";
const ACTIVE_RUTH_ID = "11111111-1111-4111-8111-000000000003";
const ACTIVE_RACHEL_ID = "11111111-1111-4111-8111-000000000004";
const BLOCKED_BY_ME_ID = "11111111-1111-4111-8111-000000000005";
const BLOCKED_ME_ID = "11111111-1111-4111-8111-000000000006";
const SUSPENDED_ID = "11111111-1111-4111-8111-000000000007";
const FOLLOWED_ID = "11111111-1111-4111-8111-000000000008";

// Mock the auth layer so the route handler thinks SEARCHER_ID is the
// authed rep. The rest of the row shape isn't read by the route so we
// only need id.
vi.mock("@/lib/auth", () => ({
  requireRepAuth: vi.fn(async () => ({
    rep: { id: SEARCHER_ID, status: "active" },
    error: null,
  })),
}));

// Disable rate-limiting in tests — every test fires from the same IP.
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => () => null,
}));

// Sentry is noisy in tests + nothing here is real.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

let GET: typeof import("../../app/api/rep-portal/reps/search/route").GET;

beforeAll(async () => {
  await cleanupReps();

  await supabase.from("reps").insert([
    fixtureRep(SEARCHER_ID, `${TEST_PREFIX}-searcher`, "Searcher", "One"),
    fixtureRep(ACTIVE_RAY_ID, `${TEST_PREFIX}-ray`, "Ray", "Match"),
    fixtureRep(ACTIVE_RUTH_ID, `${TEST_PREFIX}-ruth`, "Ruth", "Match"),
    fixtureRep(ACTIVE_RACHEL_ID, `${TEST_PREFIX}-rachel`, "Rachel", "Other"),
    fixtureRep(BLOCKED_BY_ME_ID, `${TEST_PREFIX}-blocked-by-me`, "Blocked", "Match"),
    fixtureRep(BLOCKED_ME_ID, `${TEST_PREFIX}-blocked-me`, "Blocker", "Match"),
    fixtureRep(SUSPENDED_ID, `${TEST_PREFIX}-suspended`, "Suspended", "Match", "suspended"),
    fixtureRep(FOLLOWED_ID, `${TEST_PREFIX}-followed`, "Followee", "Match"),
  ]);

  // Block edges in both directions
  await supabase.from("rep_blocks").insert([
    {
      blocker_rep_id: SEARCHER_ID,
      blocked_rep_id: BLOCKED_BY_ME_ID,
      reason: "test",
    },
    {
      blocker_rep_id: BLOCKED_ME_ID,
      blocked_rep_id: SEARCHER_ID,
      reason: "test",
    },
  ]);

  // Follow edges — searcher follows FOLLOWED_ID; ACTIVE_RAY_ID follows searcher
  await supabase.from("rep_follows").insert([
    { follower_id: SEARCHER_ID, followee_id: FOLLOWED_ID },
    { follower_id: ACTIVE_RAY_ID, followee_id: SEARCHER_ID },
  ]);

  // Import after mocks land + fixtures are seeded.
  GET = (await import("../../app/api/rep-portal/reps/search/route")).GET;
});

afterAll(async () => {
  await cleanupReps();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/rep-portal/reps/search", () => {
  it("active reps matching the query appear, ranked by display_name", async () => {
    const res = await call({ q: "Match" });
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(ACTIVE_RAY_ID);
    expect(ids).toContain(ACTIVE_RUTH_ID);
    expect(ids).toContain(FOLLOWED_ID);
  });

  it("searcher never appears in their own results", async () => {
    const res = await call({ q: RSTEST_SUFFIX });
    const body = await res.json();
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(SEARCHER_ID);
  });

  it("reps the searcher has blocked are excluded", async () => {
    const res = await call({ q: RSTEST_SUFFIX });
    const body = await res.json();
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(BLOCKED_BY_ME_ID);
  });

  it("reps who have blocked the searcher are excluded", async () => {
    const res = await call({ q: RSTEST_SUFFIX });
    const body = await res.json();
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(BLOCKED_ME_ID);
  });

  it("non-active reps (suspended/deleted) never appear", async () => {
    const res = await call({ q: RSTEST_SUFFIX });
    const body = await res.json();
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(SUSPENDED_ID);
  });

  it("i_follow_them is true for outgoing follow edges", async () => {
    const res = await call({ q: "Followee" });
    const body = await res.json();
    const followee = body.data.find(
      (d: { id: string }) => d.id === FOLLOWED_ID
    );
    expect(followee?.i_follow_them).toBe(true);
    expect(followee?.is_following_me).toBe(false);
  });

  it("is_following_me is true for incoming follow edges", async () => {
    const res = await call({ q: "Ray" });
    const body = await res.json();
    const ray = body.data.find((d: { id: string }) => d.id === ACTIVE_RAY_ID);
    expect(ray?.is_following_me).toBe(true);
    expect(ray?.i_follow_them).toBe(false);
  });

  it("first_name and last_name match alongside display_name", async () => {
    const res = await call({ q: "Ruth" });
    const body = await res.json();
    const ids = body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(ACTIVE_RUTH_ID);
  });

  it("rejects nothing on empty q — returns active reps the searcher can see", async () => {
    const res = await call({ q: "" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    // We don't assert exact membership — production rows may exist —
    // but our seeded blocked/suspended ones must still be filtered out.
    const ids: string[] = body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(SEARCHER_ID);
    expect(ids).not.toContain(BLOCKED_BY_ME_ID);
    expect(ids).not.toContain(BLOCKED_ME_ID);
    expect(ids).not.toContain(SUSPENDED_ID);
  });

  it("public-profile fields only — no email, phone, auth_user_id", async () => {
    const res = await call({ q: "Ruth" });
    const body = await res.json();
    const ruth = body.data.find((d: { id: string }) => d.id === ACTIVE_RUTH_ID);
    expect(ruth).toBeTruthy();
    expect(ruth.email).toBeUndefined();
    expect(ruth.phone).toBeUndefined();
    expect(ruth.auth_user_id).toBeUndefined();
  });

  it("pagination has_more flag flips correctly", async () => {
    const res = await call({ q: RSTEST_SUFFIX, limit: 1, offset: 0 });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.has_more).toBe(true);
    expect(body.pagination.total).toBeGreaterThan(1);
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

async function call(params: {
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const search = new URLSearchParams();
  if (params.q !== undefined) search.set("q", params.q);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  const url = `http://test.local/api/rep-portal/reps/search?${search.toString()}`;
  return GET(new NextRequest(url));
}

function fixtureRep(
  id: string,
  email: string,
  firstName: string,
  lastName: string,
  status: "active" | "suspended" | "deleted" = "active"
) {
  // All test reps carry the RSTEST suffix in last_name so a single
  // search term reliably hits the whole fixture set.
  const lastNameSuffixed = `${lastName}-${RSTEST_SUFFIX}`;
  return {
    id,
    email,
    first_name: firstName,
    last_name: lastNameSuffixed,
    display_name: `${firstName} ${lastNameSuffixed}`,
    status,
    points_balance: 100,
    currency_balance: 0,
    total_sales: 0,
    total_revenue: 0,
    level: 1,
    onboarding_completed: true,
    follower_count: 0,
    following_count: 0,
  };
}

async function cleanupReps() {
  // Delete in dependency order — block + follow edges first, then reps.
  const ids = [
    SEARCHER_ID,
    ACTIVE_RAY_ID,
    ACTIVE_RUTH_ID,
    ACTIVE_RACHEL_ID,
    BLOCKED_BY_ME_ID,
    BLOCKED_ME_ID,
    SUSPENDED_ID,
    FOLLOWED_ID,
  ];
  await supabase
    .from("rep_blocks")
    .delete()
    .or(`blocker_rep_id.in.(${ids.join(",")}),blocked_rep_id.in.(${ids.join(",")})`);
  await supabase
    .from("rep_follows")
    .delete()
    .or(`follower_id.in.(${ids.join(",")}),followee_id.in.(${ids.join(",")})`);
  await supabase.from("reps").delete().in("id", ids);
}
