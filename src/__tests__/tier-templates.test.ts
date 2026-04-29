import { describe, it, expect } from "vitest";
import {
  TIER_TEMPLATES,
  TIER_TEMPLATE_KEYS,
  TIER_TEMPLATE_LIST,
  getTierTemplate,
  isTierTemplateKey,
} from "@/lib/tier-templates";

describe("tier-templates", () => {
  it("exposes all five canonical keys", () => {
    expect(TIER_TEMPLATE_KEYS).toEqual([
      "early_bird_waterfall",
      "tiered_pricing",
      "members_public",
      "vip_ga_door",
      "two_phase_release",
    ]);
  });

  it("each template has at least two tiers", () => {
    for (const t of TIER_TEMPLATE_LIST) {
      expect(t.tiers.length).toBeGreaterThanOrEqual(2);
      for (const tier of t.tiers) {
        expect(typeof tier.name).toBe("string");
        expect(tier.name.length).toBeGreaterThan(0);
        expect(typeof tier.price).toBe("number");
        expect(tier.price).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("sequential templates assign capacity to every tier", () => {
    for (const t of TIER_TEMPLATE_LIST) {
      if (t.release_mode !== "sequential") continue;
      for (const tier of t.tiers) {
        expect(
          tier.capacity,
          `${t.label} → "${tier.name}" needs a capacity to gate the next tier`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("sequential templates also seed a group_name so tiers ship as a unit", () => {
    for (const t of TIER_TEMPLATE_LIST) {
      if (t.release_mode === "sequential") {
        expect(t.group_name, `${t.label} should have a group_name`).toBeTruthy();
      }
    }
  });

  it("vip_ga_door is non-sequential, intentionally", () => {
    expect(TIER_TEMPLATES.vip_ga_door.release_mode).toBe("all");
    expect(TIER_TEMPLATES.vip_ga_door.tiers).toHaveLength(3);
  });

  it("getTierTemplate returns the matching template or null", () => {
    expect(getTierTemplate("early_bird_waterfall")).toBe(
      TIER_TEMPLATES.early_bird_waterfall
    );
    expect(getTierTemplate("nope")).toBeNull();
    expect(getTierTemplate(null)).toBeNull();
    expect(getTierTemplate(undefined)).toBeNull();
    expect(getTierTemplate("")).toBeNull();
  });

  it("isTierTemplateKey narrows correctly", () => {
    expect(isTierTemplateKey("members_public")).toBe(true);
    expect(isTierTemplateKey("nope")).toBe(false);
    expect(isTierTemplateKey(null)).toBe(false);
    expect(isTierTemplateKey(123)).toBe(false);
  });
});
