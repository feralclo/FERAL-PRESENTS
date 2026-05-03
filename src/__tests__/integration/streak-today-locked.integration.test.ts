/**
 * Integration tests for the streak.today_locked field on the rep-portal
 * dashboard payload.
 *
 * Verifies:
 *   - Fresh rep with no activity today → today_locked=false
 *   - Submitting any quest today (regardless of status) → today_locked=true
 *   - XP delta logged today → today_locked=true (sales-attribution path)
 *   - Backward-compat: legacy flat streak_current / streak_best still emit
 *
 * The dashboard route is heavy — it joins memberships, leaderboard,
 * events, etc. — so we seed minimal fixtures and assert only the
 * streak block. The full payload's other paths are covered by separate
 * suites (or simply by not crashing when the rep has no team yet).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabase } from "./setup";

const TEST_REP_ID = "22222222-2222-4222-8222-000000000001";
const TEST_QUEST_ID = "22222222-2222-4222-8222-000000000010";

vi.mock("@/lib/auth", () => ({
  requireRepAuth: vi.fn(async () => ({
    rep: {
      id: TEST_REP_ID,
      status: "active",
      onboarding_completed: true,
    },
    error: null,
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

let GET: typeof import("../../app/api/rep-portal/dashboard/route").GET;

beforeAll(async () => {
  await cleanup();
  // Seed a minimal rep — no team needed; the streak path doesn't depend
  // on memberships and the rest of the dashboard returns empty arrays
  // gracefully when there are none.
  await supabase.from("reps").insert({
    id: TEST_REP_ID,
    email: "__streak_test__@feral-test.local",
    first_name: "Streak",
    last_name: "Test",
    display_name: "Streak Test",
    status: "active",
    points_balance: 0,
    currency_balance: 0,
    total_sales: 0,
    total_revenue: 0,
    level: 1,
    onboarding_completed: true,
    follower_count: 0,
    following_count: 0,
  });

  GET = (await import("../../app/api/rep-portal/dashboard/route")).GET;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset the rep's streak side-effects between tests so they're isolated.
  await supabase
    .from("rep_quest_submissions")
    .delete()
    .eq("rep_id", TEST_REP_ID);
  await supabase
    .from("rep_points_log")
    .delete()
    .eq("rep_id", TEST_REP_ID);
});

describe("streak.today_locked", () => {
  it("emits the nested streak block alongside the legacy flat keys", async () => {
    const body = await callDashboard();
    const rep = body.data.rep;
    expect(rep).toBeTruthy();
    // Backward compat
    expect(typeof rep.streak_current).toBe("number");
    expect(typeof rep.streak_best).toBe("number");
    // New nested shape
    expect(rep.streak).toBeTruthy();
    expect(typeof rep.streak.current).toBe("number");
    expect(typeof rep.streak.best).toBe("number");
    expect(typeof rep.streak.today_locked).toBe("boolean");
  });

  it("today_locked=false for a fresh rep with no activity today", async () => {
    const body = await callDashboard();
    expect(body.data.rep.streak.today_locked).toBe(false);
  });

  it("today_locked=true after a quest submission today (any status)", async () => {
    // Insert a fixture quest first — submissions FK against rep_quests
    await supabase.from("rep_quests").upsert({
      id: TEST_QUEST_ID,
      org_id: "__test_integration__",
      title: "__streak_test__ quest",
      quest_type: "story_share",
      platform: "any",
      points_reward: 50,
      currency_reward: 0,
      status: "active",
    });

    await supabase.from("rep_quest_submissions").insert({
      org_id: "__test_integration__",
      quest_id: TEST_QUEST_ID,
      rep_id: TEST_REP_ID,
      proof_type: "screenshot",
      proof_url: "https://example.com/proof.jpg",
      // status defaults to "pending" — that's the whole point of the
      // late-night-submit case we're modelling.
    });

    const body = await callDashboard();
    expect(body.data.rep.streak.today_locked).toBe(true);

    // Cleanup the fixture quest after the assertion
    await supabase
      .from("rep_quest_submissions")
      .delete()
      .eq("rep_id", TEST_REP_ID);
    await supabase.from("rep_quests").delete().eq("id", TEST_QUEST_ID);
  });

  it("today_locked=true when XP was logged today (sales-attribution path)", async () => {
    await supabase.from("rep_points_log").insert({
      org_id: "__test_integration__",
      rep_id: TEST_REP_ID,
      points: 25,
      balance_after: 25,
      source_type: "sale",
      description: "__streak_test__ sale attribution",
    });

    const body = await callDashboard();
    expect(body.data.rep.streak.today_locked).toBe(true);
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

async function callDashboard() {
  const url =
    "http://test.local/api/rep-portal/dashboard?include=rep,xp,leaderboard";
  const res = await GET(new NextRequest(url));
  expect(res.status).toBe(200);
  return res.json();
}

async function cleanup() {
  await supabase
    .from("rep_quest_submissions")
    .delete()
    .eq("rep_id", TEST_REP_ID);
  await supabase.from("rep_points_log").delete().eq("rep_id", TEST_REP_ID);
  await supabase.from("rep_quests").delete().eq("id", TEST_QUEST_ID);
  await supabase.from("reps").delete().eq("id", TEST_REP_ID);
}
