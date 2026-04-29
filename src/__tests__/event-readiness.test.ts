import { describe, it, expect } from "vitest";
import { assessEvent } from "@/lib/event-readiness";
import type { Event, TicketTypeRow } from "@/types/events";

const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt_1",
    org_id: "org_1",
    slug: "test",
    name: "Test event",
    date_start: FUTURE_ISO,
    status: "draft",
    visibility: "public",
    payment_method: "stripe",
    currency: "GBP",
    cover_image_url: "https://example.com/cover.png",
    venue_name: "Test Venue",
    about_text:
      "An exhaustively detailed event description that easily clears the eighty character minimum the readiness rule requires for a passing grade.",
    seo_title: "A custom share title",
    doors_time: "9pm — 4am",
    banner_image_url: "https://example.com/banner.png",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function activeTicket(overrides: Partial<TicketTypeRow> = {}): TicketTypeRow {
  return {
    id: "tt_1",
    org_id: "org_1",
    event_id: "evt_1",
    name: "GA",
    price: 20,
    capacity: 100,
    sold: 0,
    sort_order: 0,
    includes_merch: false,
    status: "active",
    min_per_order: 1,
    max_per_order: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("event-readiness", () => {
  it("a fully populated event with stripe verified scores 100 and can publish", () => {
    const r = assessEvent(baseEvent(), [activeTicket()], [{ artist_id: "a", artist: { id: "a", name: "A", org_id: "org_1", created_at: "", updated_at: "" }, sort_order: 0 }] as never, {
      stripeConnected: true,
    });
    expect(r.canPublish).toBe(true);
    expect(r.score).toBe(100);
    expect(r.blockers).toHaveLength(0);
  });

  it("past date_start blocks publish (mirrors server gate)", () => {
    const r = assessEvent(baseEvent({ date_start: PAST_ISO }), [activeTicket()], [], {
      stripeConnected: true,
    });
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("date_in_future");
  });

  it("missing date_start blocks publish", () => {
    const r = assessEvent(baseEvent({ date_start: "" }), [activeTicket()], [], {
      stripeConnected: true,
    });
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("date_in_future");
  });

  it("zero sellable tickets blocks publish", () => {
    const r = assessEvent(baseEvent(), [], [], { stripeConnected: true });
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("ticket_on_sale");
  });

  it("ticket with capacity=0 is not sellable", () => {
    const r = assessEvent(baseEvent(), [activeTicket({ capacity: 0 })], [], {
      stripeConnected: true,
    });
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("ticket_on_sale");
  });

  it("unlimited capacity (null) IS sellable", () => {
    const r = assessEvent(
      baseEvent(),
      [activeTicket({ capacity: undefined })],
      [],
      { stripeConnected: true }
    );
    expect(r.canPublish).toBe(true);
  });

  it("hidden ticket type is not sellable", () => {
    const r = assessEvent(baseEvent(), [activeTicket({ status: "hidden" })], [], {
      stripeConnected: true,
    });
    expect(r.canPublish).toBe(false);
  });

  it("system ticket (hidden, £0, no capacity) is filtered out", () => {
    const system: TicketTypeRow = activeTicket({
      id: "sys_1",
      status: "hidden",
      price: 0,
      capacity: undefined,
    });
    const r = assessEvent(baseEvent(), [system], [], { stripeConnected: true });
    // Only system ticket → still no real sellable ticket
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("ticket_on_sale");
  });

  it("stripe payment method requires verified Stripe", () => {
    const r = assessEvent(baseEvent({ payment_method: "stripe" }), [activeTicket()], [], {
      stripeConnected: false,
    });
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("payment_ready");
  });

  it("stripe pending (null) shows warn, not fail — and still blocks publish", () => {
    const r = assessEvent(baseEvent({ payment_method: "stripe" }), [activeTicket()], [], {
      stripeConnected: null,
    });
    expect(r.canPublish).toBe(false);
    const rule = r.rules.find((x) => x.id === "payment_ready");
    expect(rule?.status).toBe("warn");
  });

  it("external payment method skips stripe gate", () => {
    const r = assessEvent(
      baseEvent({ payment_method: "external" }),
      [activeTicket()],
      [],
      { stripeConnected: false }
    );
    expect(r.canPublish).toBe(true);
  });

  it("test payment method skips stripe gate", () => {
    const r = assessEvent(
      baseEvent({ payment_method: "test" }),
      [activeTicket()],
      [],
      { stripeConnected: false }
    );
    expect(r.canPublish).toBe(true);
  });

  it("platform owner bypasses stripe gate even on stripe events", () => {
    const r = assessEvent(baseEvent(), [activeTicket()], [], {
      stripeConnected: false,
      isPlatformOwner: true,
    });
    expect(r.canPublish).toBe(true);
  });

  it("missing cover image blocks publish", () => {
    const r = assessEvent(
      baseEvent({ cover_image_url: null, cover_image: undefined }),
      [activeTicket()],
      [],
      { stripeConnected: true }
    );
    expect(r.canPublish).toBe(false);
    expect(r.blockers.map((b) => b.id)).toContain("cover_image");
  });

  it("legacy cover_image still satisfies the cover rule", () => {
    const r = assessEvent(
      baseEvent({ cover_image_url: null, cover_image: "https://example.com/legacy.png" }),
      [activeTicket()],
      [],
      { stripeConnected: true }
    );
    expect(r.canPublish).toBe(true);
  });

  it("description shorter than 80 chars warns but does not block", () => {
    const r = assessEvent(
      baseEvent({ about_text: "Short blurb." }),
      [activeTicket()],
      [],
      { stripeConnected: true }
    );
    expect(r.canPublish).toBe(true);
    const desc = r.rules.find((x) => x.id === "description");
    expect(desc?.status).toBe("warn");
  });

  it("missing description warns but does not block", () => {
    const r = assessEvent(
      baseEvent({ about_text: undefined, description: undefined }),
      [activeTicket()],
      [],
      { stripeConnected: true }
    );
    expect(r.canPublish).toBe(true);
    const desc = r.rules.find((x) => x.id === "description");
    expect(desc?.status).toBe("fail");
  });

  it("score equals sum of weights of ok rules", () => {
    const r = assessEvent(baseEvent(), [activeTicket()], [], { stripeConnected: true });
    const expected = r.rules
      .filter((rule) => rule.status === "ok")
      .reduce((a, rule) => a + rule.weight, 0);
    expect(r.score).toBe(expected);
  });

  it("rules are returned in required → recommended → nice_to_have order", () => {
    const r = assessEvent(baseEvent(), [activeTicket()], [], { stripeConnected: true });
    const sevs = r.rules.map((rule) => rule.severity);
    const requiredEnd = sevs.lastIndexOf("required");
    const recommendedStart = sevs.indexOf("recommended");
    const recommendedEnd = sevs.lastIndexOf("recommended");
    const niceStart = sevs.indexOf("nice_to_have");
    expect(requiredEnd).toBeLessThan(recommendedStart === -1 ? Infinity : recommendedStart);
    if (niceStart !== -1) expect(recommendedEnd).toBeLessThan(niceStart);
  });

  it("rules carry the correct anchor for click-to-scroll-sync", () => {
    const r = assessEvent(baseEvent({ date_start: "" }), [], [], { stripeConnected: false });
    expect(r.rules.find((x) => x.id === "date_in_future")?.anchor).toBe("identity");
    expect(r.rules.find((x) => x.id === "ticket_on_sale")?.anchor).toBe("tickets");
    expect(r.rules.find((x) => x.id === "payment_ready")?.anchor).toBe("money");
    expect(r.rules.find((x) => x.id === "cover_image")?.anchor).toBe("look");
  });

  it("score is 0 for a brand-new empty event with no inputs", () => {
    const empty: Event = {
      id: "",
      org_id: "",
      slug: "",
      name: "",
      date_start: "",
      status: "draft",
      visibility: "public",
      payment_method: "stripe",
      currency: "GBP",
      created_at: "",
      updated_at: "",
    };
    const r = assessEvent(empty, [], [], { stripeConnected: false });
    expect(r.score).toBe(0);
    expect(r.canPublish).toBe(false);
  });
});
