/**
 * Integration tests for promoter context on /me/activity rows.
 *
 * Verifies:
 *   - Quest-linked rows (quest_approved from rep_points_log + rejected
 *     from rep_quest_submissions) carry promoter_* fields populated
 *     from the joined promoter row.
 *   - Non-quest rows (manual_grant) leave the promoter fields null.
 *   - All six promoter fields are always present on every row (iOS
 *     can rely on a defined key shape).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { TEST_ORG_ID, supabase } from "./setup";

const REP_ID = "55555555-5555-4555-8555-000000000001";
const PROMOTER_ID = "55555555-5555-4555-8555-000000000010";
const QUEST_ID = "55555555-5555-4555-8555-000000000020";

vi.mock("@/lib/auth", () => ({
  requireRepAuth: vi.fn(async () => ({
    rep: { id: REP_ID, status: "active", org_id: TEST_ORG_ID },
    error: null,
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

let GET: typeof import("../../app/api/rep-portal/me/activity/route").GET;

beforeAll(async () => {
  await cleanup();

  await supabase.from("reps").insert({
    id: REP_ID,
    email: "__activity_promoter__@feral-test.local",
    first_name: "Activity",
    last_name: "Test",
    display_name: "Activity Test",
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

  await supabase.from("promoters").insert({
    id: PROMOTER_ID,
    org_id: TEST_ORG_ID,
    handle: "activitytestpromoter",
    display_name: "Activity Test Promoter",
    avatar_url: "https://example.com/promoter-avatar.png",
    avatar_initials: "AT",
    avatar_bg_hex: 0xc8a2c8,
    accent_hex: 0xc8a2c8,
    visibility: "public",
  });

  await supabase.from("rep_quests").insert({
    id: QUEST_ID,
    org_id: TEST_ORG_ID,
    promoter_id: PROMOTER_ID,
    title: "Post in a group chat",
    quest_type: "story_share",
    platform: "any",
    points_reward: 50,
    currency_reward: 0,
    status: "active",
  });

  // Three points-log rows: one quest-linked, one manual, one sale. iOS
  // should see promoter context on the quest row, nulls on the others.
  // source_types match the rep_points_log CHECK constraint.
  await supabase.from("rep_points_log").insert([
    {
      org_id: TEST_ORG_ID,
      rep_id: REP_ID,
      points: 50,
      balance_after: 50,
      source_type: "quest",
      source_id: QUEST_ID,
      description: "Quest approved",
    },
    {
      org_id: TEST_ORG_ID,
      rep_id: REP_ID,
      points: 100,
      balance_after: 150,
      source_type: "manual",
      description: "Welcome bonus",
    },
    {
      org_id: TEST_ORG_ID,
      rep_id: REP_ID,
      points: 25,
      balance_after: 175,
      source_type: "sale",
      description: "Ticket sale credit",
    },
  ]);

  GET = (await import("../../app/api/rep-portal/me/activity/route")).GET;
});

afterAll(async () => {
  await cleanup();
});

describe("/me/activity promoter context", () => {
  it("quest-linked rows carry promoter_* fields", async () => {
    const body = await call();
    const questRow = body.data.find(
      (r: { kind: string; title: string }) =>
        r.kind === "quest_approved" && r.title === "Post in a group chat"
    );
    expect(questRow).toBeTruthy();
    expect(questRow.promoter_id).toBe(PROMOTER_ID);
    expect(questRow.promoter_handle).toBe("activitytestpromoter");
    expect(questRow.promoter_name).toBe("Activity Test Promoter");
    expect(questRow.promoter_avatar_url).toBe(
      "https://example.com/promoter-avatar.png"
    );
    expect(questRow.promoter_avatar_initials).toBe("AT");
    expect(questRow.promoter_avatar_bg_hex).toBe(0xc8a2c8);
  });

  it("manual_grant rows leave promoter_* fields null", async () => {
    const body = await call();
    const manualRow = body.data.find(
      (r: { kind: string }) => r.kind === "manual_grant"
    );
    expect(manualRow).toBeTruthy();
    expect(manualRow.promoter_id).toBeNull();
    expect(manualRow.promoter_handle).toBeNull();
    expect(manualRow.promoter_name).toBeNull();
    expect(manualRow.promoter_avatar_url).toBeNull();
    expect(manualRow.promoter_avatar_initials).toBeNull();
    expect(manualRow.promoter_avatar_bg_hex).toBeNull();
  });

  it("sale rows leave promoter_* fields null", async () => {
    const body = await call();
    const sale = body.data.find(
      (r: { kind: string }) => r.kind === "sale"
    );
    expect(sale).toBeTruthy();
    expect(sale.promoter_id).toBeNull();
  });

  it("kind classifies on canonical source_types (regression test)", async () => {
    const body = await call();
    const kinds = body.data.map((r: { kind: string }) => r.kind).sort();
    // Should include the three kinds we seeded — NOT 'other' for any
    // of them (the bug this commit fixes was every row falling to 'other').
    expect(kinds).toContain("quest_approved");
    expect(kinds).toContain("manual_grant");
    expect(kinds).toContain("sale");
    expect(kinds).not.toContain("other");
  });

  it("every row has all six promoter_* keys defined (not undefined)", async () => {
    const body = await call();
    for (const r of body.data) {
      for (const key of [
        "promoter_id",
        "promoter_handle",
        "promoter_name",
        "promoter_avatar_url",
        "promoter_avatar_initials",
        "promoter_avatar_bg_hex",
      ]) {
        expect(r).toHaveProperty(key);
      }
    }
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

async function call() {
  const url = "http://test.local/api/rep-portal/me/activity?limit=50";
  const res = await GET(new NextRequest(url));
  expect(res.status).toBe(200);
  return res.json();
}

async function cleanup() {
  await supabase.from("rep_points_log").delete().eq("rep_id", REP_ID);
  await supabase
    .from("rep_quest_submissions")
    .delete()
    .eq("rep_id", REP_ID);
  await supabase.from("rep_quests").delete().eq("id", QUEST_ID);
  await supabase.from("promoters").delete().eq("id", PROMOTER_ID);
  await supabase.from("reps").delete().eq("id", REP_ID);
}
