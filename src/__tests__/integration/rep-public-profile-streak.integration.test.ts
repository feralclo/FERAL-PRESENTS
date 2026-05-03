/**
 * Integration tests for the streak_current field on the public rep
 * profile endpoint (GET /api/rep-portal/reps/[id]).
 *
 * Verifies:
 *   - Reps with no rep_streaks row default to streak_current=0
 *   - Reps with a rep_streaks row surface their current_streak as int
 *   - Field is present even when looking at someone else (public,
 *     not self-only — unlike today_locked which only ships on the
 *     dashboard rep block)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { supabase } from "./setup";

const VIEWER_ID = "33333333-3333-4333-8333-000000000001";
const NO_STREAK_ID = "33333333-3333-4333-8333-000000000002";
const ON_FIRE_ID = "33333333-3333-4333-8333-000000000003";

vi.mock("@/lib/auth", () => ({
  requireRepAuth: vi.fn(async () => ({
    rep: { id: VIEWER_ID, status: "active" },
    error: null,
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

let GET: typeof import("../../app/api/rep-portal/reps/[id]/route").GET;

beforeAll(async () => {
  await cleanup();

  await supabase.from("reps").insert([
    fixtureRep(VIEWER_ID, "viewer"),
    fixtureRep(NO_STREAK_ID, "nostreak"),
    fixtureRep(ON_FIRE_ID, "onfire"),
  ]);

  await supabase.from("rep_streaks").insert({
    rep_id: ON_FIRE_ID,
    current_streak: 12,
    best_streak: 30,
    last_active_date: new Date().toISOString().slice(0, 10),
  });

  GET = (await import("../../app/api/rep-portal/reps/[id]/route")).GET;
});

afterAll(async () => {
  await cleanup();
});

describe("public rep profile — streak_current", () => {
  it("defaults to 0 when the rep has no rep_streaks row", async () => {
    const body = await call(NO_STREAK_ID);
    expect(body.data.streak_current).toBe(0);
  });

  it("surfaces current_streak as an int when the row exists", async () => {
    const body = await call(ON_FIRE_ID);
    expect(body.data.streak_current).toBe(12);
  });

  it("is present on a rep viewing their own profile too (self-as-public is fine)", async () => {
    // We seed a streak for the viewer so the assertion is meaningful
    await supabase.from("rep_streaks").upsert({
      rep_id: VIEWER_ID,
      current_streak: 4,
      best_streak: 4,
      last_active_date: new Date().toISOString().slice(0, 10),
    });
    const body = await call(VIEWER_ID);
    expect(body.data.streak_current).toBe(4);
    expect(body.data.is_self).toBe(true);
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

async function call(repId: string) {
  const url = `http://test.local/api/rep-portal/reps/${repId}`;
  const res = await GET(new NextRequest(url), {
    params: Promise.resolve({ id: repId }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

function fixtureRep(id: string, slug: string) {
  return {
    id,
    email: `__streak_profile_${slug}__@feral-test.local`,
    first_name: "Streak",
    last_name: `Profile-${slug.toUpperCase()}`,
    display_name: `Streak Profile ${slug}`,
    status: "active",
    points_balance: 0,
    currency_balance: 0,
    total_sales: 0,
    total_revenue: 0,
    level: 1,
    onboarding_completed: true,
    follower_count: 0,
    following_count: 0,
  };
}

async function cleanup() {
  const ids = [VIEWER_ID, NO_STREAK_ID, ON_FIRE_ID];
  await supabase.from("rep_streaks").delete().in("rep_id", ids);
  await supabase.from("reps").delete().in("id", ids);
}
