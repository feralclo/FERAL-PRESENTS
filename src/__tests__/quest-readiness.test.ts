import { describe, expect, it } from "vitest";
import {
  assessQuest,
  type QuestReadinessInput,
} from "@/lib/quest-readiness";

function baseInput(
  overrides: Partial<QuestReadinessInput> = {}
): QuestReadinessInput {
  return {
    title: "Post Only Numbers to your story",
    kind: "post_on_social",
    asset_mode: "single",
    asset_campaign_tag: null,
    sales_target: null,
    ...overrides,
  };
}

describe("quest-readiness", () => {
  it("happy path: title + kind, single mode → publishable", () => {
    const r = assessQuest(baseInput());
    expect(r.canPublish).toBe(true);
    expect(r.blockers).toHaveLength(0);
    // Two required rules always run for non-pool, non-sales quests.
    expect(r.rules).toHaveLength(2);
  });

  describe("title rule", () => {
    it("empty title fails", () => {
      const r = assessQuest(baseInput({ title: "" }));
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("title");
    });

    it("whitespace-only title fails (treated as empty)", () => {
      const r = assessQuest(baseInput({ title: "   " }));
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("title");
    });

    it("2-char title fails (under 3-char minimum)", () => {
      const r = assessQuest(baseInput({ title: "ab" }));
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("title");
    });

    it("exactly 3 chars passes", () => {
      const r = assessQuest(baseInput({ title: "abc" }));
      expect(r.canPublish).toBe(true);
    });

    it("title rule reason copy is friendly (no jargon)", () => {
      const r = assessQuest(baseInput({ title: "" }));
      const titleRule = r.blockers.find((b) => b.id === "title");
      expect(titleRule?.reason).toBeTruthy();
      // No tech-speak in copy admins read.
      expect(titleRule?.reason).not.toMatch(/(mux|sharp|supabase)/i);
    });
  });

  describe("kind rule", () => {
    it("missing kind blocks publish", () => {
      const r = assessQuest(baseInput({ kind: null }));
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("quest_kind");
    });

    it("any of the three kinds passes the kind rule", () => {
      for (const kind of ["post_on_social", "sales_target", "something_else"] as const) {
        const r = assessQuest(
          baseInput({
            kind,
            // sales_target needs a target to publish; provide one for this assertion
            sales_target: kind === "sales_target" ? 50 : null,
          })
        );
        expect(r.rules.find((rl) => rl.id === "quest_kind")?.status).toBe("ok");
      }
    });
  });

  describe("sales_target rule", () => {
    it("only runs for kind=sales_target", () => {
      const r = assessQuest(baseInput({ kind: "post_on_social" }));
      expect(r.rules.find((rl) => rl.id === "sales_target")).toBeUndefined();
    });

    it("sales_target=null fails", () => {
      const r = assessQuest(
        baseInput({ kind: "sales_target", sales_target: null })
      );
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("sales_target");
    });

    it("sales_target=0 fails", () => {
      const r = assessQuest(
        baseInput({ kind: "sales_target", sales_target: 0 })
      );
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("sales_target");
    });

    it("sales_target=1 passes", () => {
      const r = assessQuest(
        baseInput({ kind: "sales_target", sales_target: 1 })
      );
      expect(r.canPublish).toBe(true);
    });
  });

  describe("pool branch rules", () => {
    it("only run for asset_mode=pool", () => {
      const r = assessQuest(baseInput({ asset_mode: "single" }));
      expect(r.rules.find((rl) => rl.id === "pool_campaign")).toBeUndefined();
      expect(r.rules.find((rl) => rl.id === "pool_assets")).toBeUndefined();
    });

    it("pool mode without campaign tag blocks publish", () => {
      const r = assessQuest(
        baseInput({ asset_mode: "pool", asset_campaign_tag: null })
      );
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("pool_campaign");
    });

    it("pool mode with campaign tag passes campaign rule", () => {
      const r = assessQuest(
        baseInput({ asset_mode: "pool", asset_campaign_tag: "spring-26" })
      );
      // No poolAssetCount provided → pool_assets rule skipped, so the only
      // gate left is title (which passes). canPublish = true.
      expect(r.canPublish).toBe(true);
    });

    it("pool_assets rule is skipped when count is undefined", () => {
      const r = assessQuest(
        baseInput({ asset_mode: "pool", asset_campaign_tag: "spring-26" })
      );
      expect(r.rules.find((rl) => rl.id === "pool_assets")).toBeUndefined();
    });

    it("pool mode with count=0 blocks publish", () => {
      const r = assessQuest(
        baseInput({
          asset_mode: "pool",
          asset_campaign_tag: "spring-26",
          poolAssetCount: 0,
        })
      );
      expect(r.canPublish).toBe(false);
      expect(r.blockers.map((b) => b.id)).toContain("pool_assets");
    });

    it("pool mode with count=1 passes", () => {
      const r = assessQuest(
        baseInput({
          asset_mode: "pool",
          asset_campaign_tag: "spring-26",
          poolAssetCount: 1,
        })
      );
      expect(r.canPublish).toBe(true);
    });
  });

  describe("blocker aggregation", () => {
    it("all-empty input surfaces every applicable blocker at once", () => {
      const r = assessQuest({
        title: "",
        kind: null,
        asset_mode: "pool",
        asset_campaign_tag: null,
        poolAssetCount: 0,
        sales_target: null,
      });
      expect(r.canPublish).toBe(false);
      const ids = r.blockers.map((b) => b.id).sort();
      // kind is null so the sales_target rule path doesn't trigger.
      // Title + kind + pool_campaign + pool_assets all fail.
      expect(ids).toEqual(
        ["pool_assets", "pool_campaign", "quest_kind", "title"].sort()
      );
    });

    it("a published-ready quest reports zero blockers", () => {
      const r = assessQuest(baseInput({ title: "Anything" }));
      expect(r.blockers).toHaveLength(0);
    });
  });
});
