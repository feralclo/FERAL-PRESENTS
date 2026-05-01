import { describe, it, expect, beforeEach } from "vitest";
import {
  buildQuestShareUrl,
  buildRepShareUrl,
} from "@/lib/rep-share-url";

const DEFAULT_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events"
).replace(/\/$/, "");

describe("buildQuestShareUrl — happy path (event-anchored)", () => {
  it("uses the tenant's primary domain when one is registered", () => {
    const domains = new Map([["feral", "feralpresents.com"]]);
    const url = buildQuestShareUrl({
      orgId: "feral",
      eventSlug: "only-numbers-london",
      code: "ENTRYREVIEWER",
      domainsByOrgId: domains,
    });
    expect(url).toBe(
      "https://feralpresents.com/event/only-numbers-london?ref=ENTRYREVIEWER"
    );
  });

  it("falls back to the default base when no domain is registered", () => {
    const url = buildQuestShareUrl({
      orgId: "feral",
      eventSlug: "only-numbers-london",
      code: "ENTRYREVIEWER",
      domainsByOrgId: new Map(),
    });
    expect(url).toBe(
      `${DEFAULT_BASE}/event/only-numbers-london?ref=ENTRYREVIEWER`
    );
  });

  it("URL-encodes the discount code so spaces / specials don't break the link", () => {
    const url = buildQuestShareUrl({
      orgId: null,
      eventSlug: "x",
      code: "ALEX'S 10",
      domainsByOrgId: new Map(),
    });
    expect(url).toBe(`${DEFAULT_BASE}/event/x?ref=${encodeURIComponent("ALEX'S 10")}`);
  });
});

describe("buildQuestShareUrl — pool / event-less quests", () => {
  it("falls back to the tenant root when there is no event slug", () => {
    const domains = new Map([["feral", "feralpresents.com"]]);
    const url = buildQuestShareUrl({
      orgId: "feral",
      eventSlug: null,
      code: "ENTRYREVIEWER",
      domainsByOrgId: domains,
    });
    expect(url).toBe("https://feralpresents.com/?ref=ENTRYREVIEWER");
  });

  it("uses the default base when neither slug nor domain is available", () => {
    const url = buildQuestShareUrl({
      orgId: null,
      eventSlug: null,
      code: "ENTRYREVIEWER",
      domainsByOrgId: new Map(),
    });
    expect(url).toBe(`${DEFAULT_BASE}/?ref=ENTRYREVIEWER`);
  });

  it("never returns null when a code is present (the invariant iOS depends on)", () => {
    // Cartesian over every meaningful absence of context.
    const codes = ["X", "ENTRYREVIEWER"];
    const slugs: (string | null)[] = [null, "an-event"];
    const orgIds: (string | null)[] = [null, "feral", "feral-no-domain"];
    const domains = new Map([["feral", "feralpresents.com"]]);
    for (const code of codes) {
      for (const slug of slugs) {
        for (const orgId of orgIds) {
          const url = buildQuestShareUrl({
            orgId,
            eventSlug: slug,
            code,
            domainsByOrgId: domains,
          });
          expect(url, JSON.stringify({ orgId, slug, code })).not.toBeNull();
        }
      }
    }
  });
});

describe("buildQuestShareUrl — null contract", () => {
  it("returns null only when the rep has no discount code", () => {
    expect(
      buildQuestShareUrl({
        orgId: "feral",
        eventSlug: "x",
        code: null,
        domainsByOrgId: new Map([["feral", "feralpresents.com"]]),
      })
    ).toBeNull();
    expect(
      buildQuestShareUrl({
        orgId: "feral",
        eventSlug: null,
        code: null,
      })
    ).toBeNull();
  });

  it("treats empty-string code as missing", () => {
    expect(
      buildQuestShareUrl({
        orgId: "feral",
        eventSlug: "x",
        code: "",
      })
    ).toBeNull();
  });
});

describe("buildRepShareUrl — masthead share (rep-level, not quest)", () => {
  beforeEach(() => {
    void 0;
  });

  it("uses primary domain when present", () => {
    const url = buildRepShareUrl({
      orgId: "feral",
      code: "ENTRYREVIEWER",
      domainsByOrgId: new Map([["feral", "feralpresents.com"]]),
    });
    expect(url).toBe("https://feralpresents.com/?ref=ENTRYREVIEWER");
  });

  it("falls back to the platform default when there is no domain", () => {
    const url = buildRepShareUrl({
      orgId: null,
      code: "ENTRYREVIEWER",
    });
    expect(url).toBe(`${DEFAULT_BASE}/?ref=ENTRYREVIEWER`);
  });

  it("returns null only when there is no code", () => {
    expect(
      buildRepShareUrl({
        orgId: "feral",
        code: null,
        domainsByOrgId: new Map([["feral", "feralpresents.com"]]),
      })
    ).toBeNull();
  });
});
