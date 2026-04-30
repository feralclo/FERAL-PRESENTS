import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { summariseEvent, todayVsRecentLabel } from "@/lib/event-summary";

const FIXED_NOW = new Date("2026-04-30T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    status: "live",
    date_start: "2026-05-10T20:00:00Z",
    capacity: 300,
    totals: { sold: 100, revenue: 2000 },
    windows: {
      today: { sold: 5, revenue: 100 },
      last_7d: { sold: 35, revenue: 700 },
      prev_7d: { sold: 30, revenue: 600 },
    },
    ...overrides,
  };
}

describe("summariseEvent", () => {
  it("celebrates a sold-out event", () => {
    const out = summariseEvent(
      makeInput({
        capacity: 100,
        totals: { sold: 100, revenue: 2000 },
      })
    );
    expect(out.mood).toBe("sold_out");
    expect(out.headline).toMatch(/sold out/i);
  });

  it("reports past events with the final count", () => {
    const out = summariseEvent(
      makeInput({
        date_start: "2026-04-20T20:00:00Z", // before FIXED_NOW
        totals: { sold: 75, revenue: 1500 },
        capacity: 100,
      })
    );
    expect(out.mood).toBe("neutral");
    expect(out.headline).toMatch(/done/i);
    expect(out.subline).toMatch(/75/);
  });

  it("nudges to share when just launched with no sales and >14 days out", () => {
    const out = summariseEvent(
      makeInput({
        date_start: "2026-05-25T20:00:00Z",
        totals: { sold: 0, revenue: 0 },
        windows: {
          today: { sold: 0, revenue: 0 },
          last_7d: { sold: 0, revenue: 0 },
          prev_7d: { sold: 0, revenue: 0 },
        },
      })
    );
    expect(out.mood).toBe("pending");
    expect(out.headline).toMatch(/just launched/i);
  });

  it("warns when no sales and event is soon", () => {
    const out = summariseEvent(
      makeInput({
        date_start: "2026-05-02T20:00:00Z", // ~2 days
        totals: { sold: 0, revenue: 0 },
        windows: {
          today: { sold: 0, revenue: 0 },
          last_7d: { sold: 0, revenue: 0 },
          prev_7d: { sold: 0, revenue: 0 },
        },
      })
    );
    expect(out.mood).toBe("concern");
    expect(out.headline).toMatch(/no sales yet/i);
  });

  it("announces sellout pace when projection meets capacity", () => {
    const out = summariseEvent(
      makeInput({
        date_start: "2026-05-15T20:00:00Z", // ~15 days
        capacity: 200,
        totals: { sold: 100, revenue: 2000 },
        // 70 a week = 10/day; over 15 days = +150 → projects to 250 > 200
        windows: {
          today: { sold: 10, revenue: 200 },
          last_7d: { sold: 70, revenue: 1400 },
          prev_7d: { sold: 60, revenue: 1200 },
        },
      })
    );
    expect(out.mood).toBe("great");
    expect(out.headline).toMatch(/sell out|sellout/i);
  });

  it("flags slow pace when projection is well below capacity", () => {
    const out = summariseEvent(
      makeInput({
        date_start: "2026-05-15T20:00:00Z",
        capacity: 1000,
        totals: { sold: 50, revenue: 1000 },
        // ~7/week → 1/day → 15 more → projects to ~65 of 1000 (6.5%)
        windows: {
          today: { sold: 1, revenue: 20 },
          last_7d: { sold: 7, revenue: 140 },
          prev_7d: { sold: 7, revenue: 140 },
        },
      })
    );
    expect(out.mood).toBe("concern");
    expect(out.headline).toMatch(/push|slow/i);
  });

  it("flags a stalled week when last_7d is zero and prev_7d had sales", () => {
    const out = summariseEvent(
      makeInput({
        capacity: 1000,
        totals: { sold: 200, revenue: 4000 },
        windows: {
          today: { sold: 0, revenue: 0 },
          last_7d: { sold: 0, revenue: 0 },
          prev_7d: { sold: 30, revenue: 600 },
        },
      })
    );
    expect(out.mood).toBe("concern");
    expect(out.headline).toMatch(/stalled/i);
  });

  it("falls through to a healthy 'going strong' message when mid-pace", () => {
    const out = summariseEvent(
      makeInput({
        capacity: 1000,
        totals: { sold: 600, revenue: 12000 },
        // mid-pace projection: 35 over 10 days = 350 → 950 of 1000, that's 95%, sellout territory
        // To trigger 'going strong', project below 95%: 10 over 10 days = 100 → 700 of 1000
        windows: {
          today: { sold: 1, revenue: 20 },
          last_7d: { sold: 10, revenue: 200 },
          prev_7d: { sold: 12, revenue: 240 },
        },
      })
    );
    expect(out.mood).toBe("good");
    expect(out.headline).toMatch(/going strong|sold/);
  });

  it("handles cancelled status separately", () => {
    const out = summariseEvent(
      makeInput({ status: "cancelled" })
    );
    expect(out.mood).toBe("neutral");
    expect(out.headline).toMatch(/cancelled/i);
  });

  it("handles archived status separately", () => {
    const out = summariseEvent(
      makeInput({ status: "archived" })
    );
    expect(out.mood).toBe("neutral");
    expect(out.headline).toMatch(/archived/i);
  });

  it("survives unlimited-capacity events", () => {
    const out = summariseEvent(
      makeInput({
        capacity: null,
        totals: { sold: 50, revenue: 1000 },
      })
    );
    expect(out.headline).toMatch(/50/);
  });
});

describe("todayVsRecentLabel", () => {
  it("returns 'no sales today' when today is zero", () => {
    expect(todayVsRecentLabel(0, 70)).toMatch(/no sales today/i);
  });

  it("returns 'first sales this week' when today has sales but week is silent", () => {
    expect(todayVsRecentLabel(5, 0)).toMatch(/first sales/i);
  });

  it("flags best day when today >= 1.6× recent average", () => {
    // recent avg = 5/day; today = 9 → ratio 1.8
    expect(todayVsRecentLabel(9, 35)).toMatch(/best day/i);
  });

  it("flags above-pace when 1.1× to 1.6×", () => {
    expect(todayVsRecentLabel(7, 35)).toMatch(/above/i);
  });

  it("flags in-line when ~normal", () => {
    expect(todayVsRecentLabel(5, 35)).toMatch(/in line/i);
  });

  it("flags slower-than-usual when well below", () => {
    expect(todayVsRecentLabel(2, 35)).toMatch(/slower/i);
  });
});
