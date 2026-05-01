import { describe, it, expect } from "vitest";
import { resolveQuestOrgId } from "@/lib/library/quest-org";

describe("resolveQuestOrgId", () => {
  it("prefers the quest's own org_id over every other source", () => {
    expect(
      resolveQuestOrgId({
        org_id: "feral",
        event: { org_id: "different-org" },
        promoter: { org_id: "another-org" },
      })
    ).toBe("feral");
  });

  it("falls back to event.org_id when quest.org_id is null", () => {
    expect(
      resolveQuestOrgId({
        org_id: null,
        event: { org_id: "feral" },
      })
    ).toBe("feral");
  });

  it("falls back to event.org_id when quest.org_id is empty string", () => {
    expect(
      resolveQuestOrgId({
        org_id: "",
        event: { org_id: "feral" },
      })
    ).toBe("feral");
  });

  it("falls back to event.org_id when quest.org_id is whitespace only", () => {
    expect(
      resolveQuestOrgId({
        org_id: "   ",
        event: { org_id: "feral" },
      })
    ).toBe("feral");
  });

  it("falls back to promoter.org_id when both quest and event are missing", () => {
    expect(
      resolveQuestOrgId({
        org_id: null,
        event: null,
        promoter: { org_id: "feral" },
      })
    ).toBe("feral");
  });

  it("handles event field that comes back as a one-element array", () => {
    expect(
      resolveQuestOrgId({
        org_id: null,
        event: [{ org_id: "feral" }],
      })
    ).toBe("feral");
  });

  it("handles promoter field that comes back as a one-element array", () => {
    expect(
      resolveQuestOrgId({
        org_id: null,
        event: null,
        promoter: [{ org_id: "feral" }],
      })
    ).toBe("feral");
  });

  it("handles event field that comes back as an empty array", () => {
    expect(
      resolveQuestOrgId({
        org_id: null,
        event: [],
        promoter: { org_id: "feral" },
      })
    ).toBe("feral");
  });

  it("returns null only when every link is missing", () => {
    expect(
      resolveQuestOrgId({
        org_id: null,
        event: null,
        promoter: null,
      })
    ).toBeNull();
  });

  it("returns null when every link is present but org_id values are empty", () => {
    expect(
      resolveQuestOrgId({
        org_id: "",
        event: { org_id: null },
        promoter: { org_id: "" },
      })
    ).toBeNull();
  });

  it("treats undefined fields like missing fields", () => {
    expect(resolveQuestOrgId({})).toBeNull();
    expect(
      resolveQuestOrgId({ event: { org_id: "feral" } })
    ).toBe("feral");
  });
});
