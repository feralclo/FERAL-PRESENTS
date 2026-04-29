import { describe, it, expect } from "vitest";
import {
  buildTimelineSeries,
  densifyBuckets,
  estimateUnlock,
  fillDateRange,
  formatDaysHedged,
  projectForward,
  toUtcDateString,
  velocityByTicket,
  type SalesBucket,
  type TicketTypeRef,
} from "@/lib/sales-velocity";

const T1 = "tt-1";
const T2 = "tt-2";

function bucket(date: string, perTicket: SalesBucket["perTicket"]): SalesBucket {
  return { date, perTicket };
}

describe("sales-velocity / toUtcDateString", () => {
  it("formats UTC date as YYYY-MM-DD regardless of host timezone", () => {
    expect(toUtcDateString(new Date("2026-04-29T01:23:45.000Z"))).toBe(
      "2026-04-29"
    );
    expect(toUtcDateString(new Date("2026-12-31T23:59:59.999Z"))).toBe(
      "2026-12-31"
    );
  });
});

describe("sales-velocity / fillDateRange", () => {
  it("returns inclusive YYYY-MM-DD strings ascending", () => {
    const range = fillDateRange(
      new Date("2026-04-26T12:00:00Z"),
      new Date("2026-04-29T00:00:00Z")
    );
    expect(range).toEqual([
      "2026-04-26",
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
    ]);
  });

  it("returns a single date when start == end", () => {
    const range = fillDateRange(
      new Date("2026-04-29T00:00:00Z"),
      new Date("2026-04-29T23:59:59Z")
    );
    expect(range).toEqual(["2026-04-29"]);
  });
});

describe("sales-velocity / densifyBuckets", () => {
  it("returns [] for empty input", () => {
    expect(densifyBuckets([])).toEqual([]);
  });

  it("inserts zero-buckets for gaps and preserves real buckets", () => {
    const dense = densifyBuckets([
      bucket("2026-04-26", { [T1]: { qty: 1, revenue: 10 } }),
      bucket("2026-04-29", { [T1]: { qty: 4, revenue: 40 } }),
    ]);
    expect(dense.map((b) => b.date)).toEqual([
      "2026-04-26",
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
    ]);
    expect(dense[1].perTicket).toEqual({});
    expect(dense[2].perTicket).toEqual({});
    expect(dense[3].perTicket[T1]).toEqual({ qty: 4, revenue: 40 });
  });
});

describe("sales-velocity / velocityByTicket", () => {
  it("averages the trailing window over the full window length when sales started earlier", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const buckets: SalesBucket[] = [
      bucket("2026-04-23", { [T1]: { qty: 7, revenue: 70 } }),
      bucket("2026-04-25", { [T1]: { qty: 7, revenue: 70 } }),
      bucket("2026-04-28", { [T2]: { qty: 2, revenue: 30 } }),
    ];
    const v = velocityByTicket(buckets, 7, now);
    // Window = 7 days. Both T1 buckets fall inside.
    const t1 = v.get(T1);
    expect(t1).toBeDefined();
    expect(t1!.qty).toBe(14);
    expect(t1!.windowDays).toBe(7);
    expect(t1!.perDay).toBeCloseTo(2, 5);

    const t2 = v.get(T2);
    expect(t2).toBeDefined();
    expect(t2!.qty).toBe(2);
  });

  it("clamps the effective window when sales only started recently", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const buckets: SalesBucket[] = [
      bucket("2026-04-28", { [T1]: { qty: 3, revenue: 30 } }),
      bucket("2026-04-29", { [T1]: { qty: 1, revenue: 10 } }),
    ];
    const v = velocityByTicket(buckets, 7, now);
    // Earliest bucket within window is 2026-04-28 → effective window = 2 days
    const t1 = v.get(T1)!;
    expect(t1.qty).toBe(4);
    expect(t1.windowDays).toBe(2);
    expect(t1.perDay).toBe(2);
  });

  it("returns an empty map when no buckets fall inside the window", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const v = velocityByTicket(
      [bucket("2026-04-01", { [T1]: { qty: 99, revenue: 990 } })],
      7,
      now
    );
    expect(v.size).toBe(0);
  });
});

describe("sales-velocity / estimateUnlock", () => {
  const now = new Date("2026-04-29T12:00:00Z");
  const baseVelocity = new Map([
    [T1, { qty: 14, perDay: 2, windowDays: 7 }],
  ]);

  it("returns no_predecessor when called with null", () => {
    const r = estimateUnlock(null, baseVelocity, now);
    expect(r.unlockAt).toBeNull();
    expect(r.reason).toBe("no_predecessor");
  });

  it("returns predecessor_unlimited when capacity is null", () => {
    const pred: TicketTypeRef = {
      id: T1,
      name: "Early bird",
      sold: 10,
      capacity: null,
      sort_order: 0,
    };
    const r = estimateUnlock(pred, baseVelocity, now);
    expect(r.reason).toBe("predecessor_unlimited");
    expect(r.unlockAt).toBeNull();
  });

  it("returns predecessor_already_sold_out when remaining is zero", () => {
    const pred: TicketTypeRef = {
      id: T1,
      name: "Early bird",
      sold: 100,
      capacity: 100,
      sort_order: 0,
    };
    const r = estimateUnlock(pred, baseVelocity, now);
    expect(r.reason).toBe("predecessor_already_sold_out");
    expect(r.unlockAt).toBeNull();
  });

  it("returns no_velocity when the per-day rate is zero", () => {
    const pred: TicketTypeRef = {
      id: T1,
      name: "Early bird",
      sold: 0,
      capacity: 100,
      sort_order: 0,
    };
    const v = new Map([[T1, { qty: 0, perDay: 0, windowDays: 7 }]]);
    const r = estimateUnlock(pred, v, now);
    expect(r.reason).toBe("no_velocity");
    expect(r.unlockAt).toBeNull();
  });

  it("computes the unlock date from remaining / perDay when velocity is positive", () => {
    const pred: TicketTypeRef = {
      id: T1,
      name: "Early bird",
      sold: 90,
      capacity: 100,
      sort_order: 0,
    };
    const r = estimateUnlock(pred, baseVelocity, now);
    expect(r.reason).toBeNull();
    expect(r.daysFromNow).toBeCloseTo(5, 5); // 10 left ÷ 2/day
    expect(r.unlockAt).not.toBeNull();
    // 5 days from 2026-04-29T12:00:00Z = 2026-05-04T12:00:00Z
    expect(r.unlockAt!.toISOString()).toBe("2026-05-04T12:00:00.000Z");
    expect(r.predecessor).toBe(pred);
  });
});

describe("sales-velocity / buildTimelineSeries", () => {
  const buckets: SalesBucket[] = [
    bucket("2026-04-27", {
      [T1]: { qty: 2, revenue: 20 },
      [T2]: { qty: 1, revenue: 50 },
    }),
    bucket("2026-04-28", { [T1]: { qty: 3, revenue: 30 } }),
    bucket("2026-04-29", {
      [T1]: { qty: 1, revenue: 10 },
      [T2]: { qty: 2, revenue: 100 },
    }),
  ];

  it("sums all ticket types when no id is given", () => {
    const s = buildTimelineSeries(buckets);
    expect(s.daily.map((b) => b.qty)).toEqual([3, 3, 3]);
    expect(s.cumulative.map((b) => b.qty)).toEqual([3, 6, 9]);
    expect(s.totals.qty).toBe(9);
    expect(s.totals.revenue).toBe(210);
  });

  it("filters to a single ticket type when id is given", () => {
    const s = buildTimelineSeries(buckets, T2);
    expect(s.daily.map((b) => b.qty)).toEqual([1, 0, 2]);
    expect(s.cumulative.map((b) => b.qty)).toEqual([1, 1, 3]);
    expect(s.totals.qty).toBe(3);
    expect(s.totals.revenue).toBe(150);
  });
});

describe("sales-velocity / projectForward", () => {
  const buckets: SalesBucket[] = [
    bucket("2026-04-27", { [T1]: { qty: 5, revenue: 100 } }),
    bucket("2026-04-28", { [T1]: { qty: 5, revenue: 100 } }),
    bucket("2026-04-29", { [T1]: { qty: 5, revenue: 100 } }),
  ];

  it("returns empty when perDay is zero or daysAhead is zero", () => {
    const series = buildTimelineSeries(buckets);
    expect(projectForward(series, 0, 1, 7).daily).toEqual([]);
    expect(projectForward(series, 5, 1, 0).daily).toEqual([]);
  });

  it("continues the cumulative line forward at perDay × multiplier", () => {
    const series = buildTimelineSeries(buckets);
    // perDay = 5, multiplier = 1.5 → 7.5/day
    const proj = projectForward(series, 5, 1.5, 4);
    expect(proj.daily).toHaveLength(4);
    expect(proj.daily[0].date).toBe("2026-04-30");
    expect(proj.daily[0].qty).toBe(7.5);
    expect(proj.cumulative[0].qty).toBe(15 + 7.5);
    expect(proj.cumulative[3].qty).toBe(15 + 7.5 * 4);
    // Revenue uses the actual rev-per-qty (100/5 = 20)
    expect(proj.daily[0].revenue).toBe(7.5 * 20);
  });
});

describe("sales-velocity / formatDaysHedged", () => {
  it("uses friendly hedged copy at every band", () => {
    expect(formatDaysHedged(0.2)).toBe("later today");
    expect(formatDaysHedged(1)).toBe("in about a day");
    expect(formatDaysHedged(3)).toBe("in about 3 days");
    expect(formatDaysHedged(10)).toBe("in about 10 days");
    expect(formatDaysHedged(20)).toBe("in about 3 weeks");
    expect(formatDaysHedged(70)).toBe("in over two months");
  });
});
