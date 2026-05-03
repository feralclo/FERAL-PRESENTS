/**
 * Integration tests for actor_photo_url on GET /api/rep-portal/notifications.
 *
 * Verifies:
 *   - Peer-action notifications (rep_follow) resolve the actor's photo_url
 *     via metadata.follower_rep_id
 *   - System notifications (quest_approved, manual_grant, ...) emit
 *     actor_photo_url: null so iOS falls back to the kind glyph
 *   - When the metadata's actor rep_id no longer exists, actor_photo_url
 *     is null (no crash)
 *   - Field is always present (not omitted) — iOS expects a defined key
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { TEST_ORG_ID, supabase } from "./setup";

const VIEWER_ID = "44444444-4444-4444-8444-000000000001";
const ACTOR_WITH_PHOTO_ID = "44444444-4444-4444-8444-000000000002";
const ACTOR_NO_PHOTO_ID = "44444444-4444-4444-8444-000000000003";
const ACTOR_PHOTO_URL = "https://cdn.example.com/photo.jpg";

vi.mock("@/lib/auth", () => ({
  requireRepAuth: vi.fn(async () => ({
    rep: { id: VIEWER_ID, status: "active", org_id: TEST_ORG_ID },
    error: null,
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

let GET: typeof import("../../app/api/rep-portal/notifications/route").GET;

beforeAll(async () => {
  await cleanup();

  await supabase.from("reps").insert([
    {
      id: VIEWER_ID,
      email: "__notif_actor_viewer__@feral-test.local",
      first_name: "Viewer",
      last_name: "NotifTest",
      display_name: "Viewer NotifTest",
      status: "active",
      points_balance: 0,
      currency_balance: 0,
      total_sales: 0,
      total_revenue: 0,
      level: 1,
      onboarding_completed: true,
      follower_count: 0,
      following_count: 0,
    },
    {
      id: ACTOR_WITH_PHOTO_ID,
      email: "__notif_actor_with_photo__@feral-test.local",
      first_name: "Actor",
      last_name: "WithPhoto",
      display_name: "Actor WithPhoto",
      photo_url: ACTOR_PHOTO_URL,
      status: "active",
      points_balance: 0,
      currency_balance: 0,
      total_sales: 0,
      total_revenue: 0,
      level: 1,
      onboarding_completed: true,
      follower_count: 0,
      following_count: 0,
    },
    {
      id: ACTOR_NO_PHOTO_ID,
      email: "__notif_actor_no_photo__@feral-test.local",
      first_name: "Actor",
      last_name: "NoPhoto",
      display_name: "Actor NoPhoto",
      status: "active",
      points_balance: 0,
      currency_balance: 0,
      total_sales: 0,
      total_revenue: 0,
      level: 1,
      onboarding_completed: true,
      follower_count: 0,
      following_count: 0,
    },
  ]);

  await supabase.from("rep_notifications").insert([
    {
      org_id: TEST_ORG_ID,
      rep_id: VIEWER_ID,
      type: "rep_follow",
      title: "New follower",
      body: "Actor WithPhoto started following you",
      metadata: { follower_rep_id: ACTOR_WITH_PHOTO_ID },
      read: false,
    },
    {
      org_id: TEST_ORG_ID,
      rep_id: VIEWER_ID,
      type: "rep_follow",
      title: "New follower",
      body: "Actor NoPhoto started following you",
      metadata: { follower_rep_id: ACTOR_NO_PHOTO_ID },
      read: false,
    },
    {
      org_id: TEST_ORG_ID,
      rep_id: VIEWER_ID,
      type: "rep_follow",
      title: "New follower",
      body: "Ghost rep started following you",
      // Actor metadata that doesn't resolve to any rep — must NOT crash
      // and must surface actor_photo_url: null.
      metadata: {
        follower_rep_id: "00000000-0000-0000-0000-deaddeadbeef",
      },
      read: false,
    },
    {
      org_id: TEST_ORG_ID,
      rep_id: VIEWER_ID,
      type: "quest_approved",
      title: "Approved",
      body: "Your submission was approved",
      metadata: { submission_id: "x" },
      read: false,
    },
  ]);

  GET = (await import("../../app/api/rep-portal/notifications/route")).GET;
});

afterAll(async () => {
  await cleanup();
});

describe("notifications actor_photo_url", () => {
  it("resolves actor_photo_url via metadata.follower_rep_id for rep_follow", async () => {
    const body = await call();
    const withPhoto = body.data.find(
      (n: { body: string }) => n.body === "Actor WithPhoto started following you"
    );
    expect(withPhoto).toBeTruthy();
    expect(withPhoto.actor_photo_url).toBe(ACTOR_PHOTO_URL);
  });

  it("returns null when the actor has no photo_url set", async () => {
    const body = await call();
    const noPhoto = body.data.find(
      (n: { body: string }) => n.body === "Actor NoPhoto started following you"
    );
    expect(noPhoto).toBeTruthy();
    expect(noPhoto.actor_photo_url).toBeNull();
  });

  it("returns null when the metadata actor rep_id doesn't resolve", async () => {
    const body = await call();
    const ghost = body.data.find(
      (n: { body: string }) => n.body === "Ghost rep started following you"
    );
    expect(ghost).toBeTruthy();
    expect(ghost.actor_photo_url).toBeNull();
  });

  it("system notifications (no actor) ship actor_photo_url: null", async () => {
    const body = await call();
    const system = body.data.find(
      (n: { type: string }) => n.type === "quest_approved"
    );
    expect(system).toBeTruthy();
    expect(system.actor_photo_url).toBeNull();
  });

  it("actor_photo_url key is present on every notification (not undefined)", async () => {
    const body = await call();
    for (const n of body.data) {
      expect(n).toHaveProperty("actor_photo_url");
    }
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

async function call() {
  const url = "http://test.local/api/rep-portal/notifications?limit=50";
  const res = await GET(new NextRequest(url));
  expect(res.status).toBe(200);
  return res.json();
}

async function cleanup() {
  await supabase
    .from("rep_notifications")
    .delete()
    .eq("rep_id", VIEWER_ID);
  await supabase
    .from("reps")
    .delete()
    .in("id", [VIEWER_ID, ACTOR_WITH_PHOTO_ID, ACTOR_NO_PHOTO_ID]);
}
