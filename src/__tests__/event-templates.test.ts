import { describe, it, expect } from "vitest";
import {
  EVENT_TEMPLATES,
  EVENT_TEMPLATE_KEYS,
  EVENT_TEMPLATE_LIST,
  getEventTemplate,
  isEventTemplateKey,
} from "@/lib/event-templates";

describe("event-templates", () => {
  it("exposes all five canonical keys", () => {
    expect(EVENT_TEMPLATE_KEYS).toEqual([
      "concert",
      "club",
      "festival",
      "conference",
      "private",
    ]);
  });

  it("each template has at least one ticket tier", () => {
    for (const t of EVENT_TEMPLATE_LIST) {
      expect(t.ticket_types.length).toBeGreaterThan(0);
      for (const tt of t.ticket_types) {
        expect(typeof tt.name).toBe("string");
        expect(tt.name.length).toBeGreaterThan(0);
        expect(typeof tt.price).toBe("number");
        expect(tt.price).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("ticket sort_order is monotonically increasing within each template", () => {
    for (const t of EVENT_TEMPLATE_LIST) {
      const orders = t.ticket_types.map((tt) => tt.sort_order ?? 0);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });

  it("private template defaults to private visibility, others to public", () => {
    expect(EVENT_TEMPLATES.private.default_visibility).toBe("private");
    expect(EVENT_TEMPLATES.concert.default_visibility).toBe("public");
    expect(EVENT_TEMPLATES.club.default_visibility).toBe("public");
    expect(EVENT_TEMPLATES.festival.default_visibility).toBe("public");
    expect(EVENT_TEMPLATES.conference.default_visibility).toBe("public");
  });

  it("conference + private hide lineup; concert/club/festival show it", () => {
    expect(EVENT_TEMPLATES.conference.show_lineup).toBe(false);
    expect(EVENT_TEMPLATES.private.show_lineup).toBe(false);
    expect(EVENT_TEMPLATES.concert.show_lineup).toBe(true);
    expect(EVENT_TEMPLATES.club.show_lineup).toBe(true);
    expect(EVENT_TEMPLATES.festival.show_lineup).toBe(true);
  });

  it("getEventTemplate returns the matching template or null", () => {
    expect(getEventTemplate("concert")).toBe(EVENT_TEMPLATES.concert);
    expect(getEventTemplate("nope")).toBeNull();
    expect(getEventTemplate(null)).toBeNull();
    expect(getEventTemplate(undefined)).toBeNull();
    expect(getEventTemplate("")).toBeNull();
  });

  it("isEventTemplateKey narrows correctly", () => {
    expect(isEventTemplateKey("club")).toBe(true);
    expect(isEventTemplateKey("nope")).toBe(false);
    expect(isEventTemplateKey(null)).toBe(false);
    expect(isEventTemplateKey(123)).toBe(false);
  });
});
