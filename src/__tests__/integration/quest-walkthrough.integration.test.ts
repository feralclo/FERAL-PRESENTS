/**
 * Integration tests for the `walkthrough_video_url` column on `rep_quests`.
 *
 * Hits the REAL Supabase database to verify:
 * - The column exists, is nullable, and round-trips a Mux playback id.
 * - PATCH-style updates can clear the field back to NULL.
 * - Rows without the field set surface as NULL (not undefined).
 *
 * The redesigned admin editor writes this column on save (Phase 4) and the
 * rep-portal `GET /api/rep-portal/quests` serializer emits it (Phase 0.3).
 * iOS surfaces it as a "Watch how" button on `QuestDetailSheet`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TEST_ORG_ID, supabase } from "./setup";

const TEST_ROW_PREFIX = "__walkthrough_test__";

async function cleanupQuests() {
  // Targeted cleanup — only this test's rows. Uses the title prefix so we
  // never touch other tests' fixtures.
  await supabase
    .from("rep_quests")
    .delete()
    .eq("org_id", TEST_ORG_ID)
    .like("title", `${TEST_ROW_PREFIX}%`);
}

beforeAll(async () => {
  await cleanupQuests();
});

afterAll(async () => {
  await cleanupQuests();
});

describe("walkthrough_video_url integration", () => {
  it("rep_quests row round-trips a Mux playback id", async () => {
    const playbackId = "abc123MuxPlaybackIdForTest";

    const { data: inserted, error: insertErr } = await supabase
      .from("rep_quests")
      .insert({
        org_id: TEST_ORG_ID,
        title: `${TEST_ROW_PREFIX}-roundtrip`,
        quest_type: "story_share",
        platform: "any",
        points_reward: 50,
        currency_reward: 0,
        status: "draft",
        walkthrough_video_url: playbackId,
      })
      .select("id, walkthrough_video_url")
      .single();

    expect(insertErr).toBeNull();
    expect(inserted?.walkthrough_video_url).toBe(playbackId);

    const { data: fetched, error: fetchErr } = await supabase
      .from("rep_quests")
      .select("walkthrough_video_url")
      .eq("id", inserted!.id)
      .single();

    expect(fetchErr).toBeNull();
    expect(fetched?.walkthrough_video_url).toBe(playbackId);
  });

  it("walkthrough_video_url defaults to NULL when not provided", async () => {
    const { data: inserted, error: insertErr } = await supabase
      .from("rep_quests")
      .insert({
        org_id: TEST_ORG_ID,
        title: `${TEST_ROW_PREFIX}-default-null`,
        quest_type: "story_share",
        platform: "any",
        points_reward: 50,
        currency_reward: 0,
        status: "draft",
      })
      .select("id, walkthrough_video_url")
      .single();

    expect(insertErr).toBeNull();
    expect(inserted?.walkthrough_video_url).toBeNull();
  });

  it("UPDATE can clear walkthrough_video_url back to NULL", async () => {
    const { data: row, error: insertErr } = await supabase
      .from("rep_quests")
      .insert({
        org_id: TEST_ORG_ID,
        title: `${TEST_ROW_PREFIX}-clear`,
        quest_type: "story_share",
        platform: "any",
        points_reward: 50,
        currency_reward: 0,
        status: "draft",
        walkthrough_video_url: "originalPlaybackId",
      })
      .select("id")
      .single();

    expect(insertErr).toBeNull();

    const { data: cleared, error: updateErr } = await supabase
      .from("rep_quests")
      .update({ walkthrough_video_url: null })
      .eq("id", row!.id)
      .select("walkthrough_video_url")
      .single();

    expect(updateErr).toBeNull();
    expect(cleared?.walkthrough_video_url).toBeNull();
  });

  it("UPDATE can replace walkthrough_video_url with a new value", async () => {
    const { data: row } = await supabase
      .from("rep_quests")
      .insert({
        org_id: TEST_ORG_ID,
        title: `${TEST_ROW_PREFIX}-replace`,
        quest_type: "story_share",
        platform: "any",
        points_reward: 50,
        currency_reward: 0,
        status: "draft",
        walkthrough_video_url: "originalId",
      })
      .select("id")
      .single();

    const { data: replaced, error: updateErr } = await supabase
      .from("rep_quests")
      .update({ walkthrough_video_url: "replacementId" })
      .eq("id", row!.id)
      .select("walkthrough_video_url")
      .single();

    expect(updateErr).toBeNull();
    expect(replaced?.walkthrough_video_url).toBe("replacementId");
  });
});
