/**
 * Sales velocity — pure aggregations over an event's order_items, used by:
 *   - the admin Release Strategy panel (time-to-unlock estimates per tier)
 *   - the Sales Timeline card (cumulative + daily series)
 *   - "what-if" projection lines
 *
 * Phase 4 of EVENT-BUILDER-PLAN. Pure on purpose: deterministic, easy to test,
 * unit-testable without a real DB. The server returns a compact day-bucket
 * shape (see `/api/events/[id]/sales-timeline`) and the client folds it
 * through these helpers.
 *
 * Date model: every bucket key is a `YYYY-MM-DD` string in UTC. We don't
 * try to be timezone-clever — promoters look at "yesterday vs today" and
 * any UTC drift is small relative to the noise in the underlying signal.
 *
 * Velocity model: average daily quantity over the trailing N-day window
 * (default 7), weighted equally per day. The window is capped by the time
 * since the first sale — a 7-day average doesn't make sense if the event
 * only went on sale 3 days ago. We surface the actual window length so
 * UI can hedge ("at the pace of the last 3 days").
 */

export type SalesBucket = {
  /** UTC `YYYY-MM-DD`. */
  date: string;
  /** Per-ticket-type aggregations for this day. Sparse — only types with
   * at least one sale on this day are present. */
  perTicket: Record<string, { qty: number; revenue: number }>;
};

export type TicketTypeRef = {
  id: string;
  name: string;
  /** Current `sold` value on the ticket_types row. Used to compute remaining
   * capacity for time-to-unlock estimates. */
  sold: number;
  /** Capacity, or null/undefined for unlimited. */
  capacity: number | null | undefined;
  /** Sort order — used to identify "the next tier" in a sequential group. */
  sort_order: number;
};

export type VelocitySample = {
  /** Quantity sold over the window. */
  qty: number;
  /** Length of the window in days (clamped to time-since-first-sale). */
  windowDays: number;
  /** Average daily qty. `qty / windowDays`. */
  perDay: number;
};

/**
 * Group buckets by ticket_type_id and compute the average daily qty over the
 * trailing window. Returns a Map keyed by ticket_type_id.
 *
 * Buckets must be sorted ascending by date for the window slicing to work.
 * If they're not sorted, callers should sort first — we don't re-sort here
 * to keep this function allocation-free on the hot path.
 */
export function velocityByTicket(
  buckets: SalesBucket[],
  windowDays = 7,
  now: Date = new Date()
): Map<string, VelocitySample> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffStr = toUtcDateString(cutoff);

  const totals = new Map<string, number>();
  let firstDateInWindow: string | null = null;

  for (const b of buckets) {
    if (b.date < cutoffStr) continue;
    if (firstDateInWindow == null || b.date < firstDateInWindow) {
      firstDateInWindow = b.date;
    }
    for (const [ttId, agg] of Object.entries(b.perTicket)) {
      totals.set(ttId, (totals.get(ttId) ?? 0) + agg.qty);
    }
  }

  // Effective window length = min(windowDays, days since the earliest sale
  // in the window). At minimum 1 day so we don't divide by zero on a same-day
  // first-sale.
  const effectiveDays = (() => {
    if (!firstDateInWindow) return windowDays;
    const first = new Date(`${firstDateInWindow}T00:00:00Z`);
    const days =
      Math.floor((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, Math.min(windowDays, days));
  })();

  const out = new Map<string, VelocitySample>();
  for (const [id, qty] of totals) {
    out.set(id, { qty, windowDays: effectiveDays, perDay: qty / effectiveDays });
  }
  return out;
}

export type UnlockEstimate = {
  /** When the next tier is expected to unlock, or `null` if unlimited / no preceding tier. */
  unlockAt: Date | null;
  /** Days from `now` to unlock. Only meaningful when `unlockAt` is set. */
  daysFromNow: number | null;
  /** The preceding ticket whose sellout triggers the unlock. */
  predecessor: TicketTypeRef | null;
  /** Per-day rate the estimate is built on. */
  perDay: number;
  /** Window the rate was sampled over. UI uses this to hedge: "at the pace of the last 3 days". */
  windowDays: number;
  /** Reason an estimate could not be produced — `null` when one was. */
  reason:
    | null
    | "no_predecessor" // first tier in the group
    | "predecessor_unlimited" // capacity null on the gating tier
    | "predecessor_already_sold_out" // already unlocked
    | "no_velocity"; // zero sales in the window
};

/**
 * Estimate when the next sequential tier unlocks.
 *
 * Caller passes the *predecessor* — the tier whose sellout gates this one.
 * We compute remaining capacity on the predecessor and divide by its daily
 * sales rate. If the rate is zero, no estimate is returned (we'd rather say
 * nothing than lie).
 */
export function estimateUnlock(
  predecessor: TicketTypeRef | null,
  velocity: Map<string, VelocitySample>,
  now: Date = new Date()
): UnlockEstimate {
  if (!predecessor) {
    return blankUnlock(0, 0, "no_predecessor");
  }
  if (predecessor.capacity == null) {
    return blankUnlock(0, 0, "predecessor_unlimited", predecessor);
  }

  const remaining = Math.max(0, predecessor.capacity - predecessor.sold);
  if (remaining <= 0) {
    return blankUnlock(0, 0, "predecessor_already_sold_out", predecessor);
  }

  const sample = velocity.get(predecessor.id);
  if (!sample || sample.perDay <= 0) {
    return blankUnlock(0, 0, "no_velocity", predecessor);
  }

  const daysFromNow = remaining / sample.perDay;
  const unlockAt = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);

  return {
    unlockAt,
    daysFromNow,
    predecessor,
    perDay: sample.perDay,
    windowDays: sample.windowDays,
    reason: null,
  };
}

function blankUnlock(
  perDay: number,
  windowDays: number,
  reason: NonNullable<UnlockEstimate["reason"]>,
  predecessor: TicketTypeRef | null = null
): UnlockEstimate {
  return {
    unlockAt: null,
    daysFromNow: null,
    predecessor,
    perDay,
    windowDays,
    reason,
  };
}

export type TimelineSeries = {
  /** Day-by-day buckets ascending. */
  daily: { date: string; qty: number; revenue: number }[];
  /** Running total ascending. */
  cumulative: { date: string; qty: number; revenue: number }[];
  /** Total qty and revenue across the whole window. */
  totals: { qty: number; revenue: number };
};

/**
 * Fold per-day per-ticket buckets into combined daily + cumulative series.
 * Used by the SalesTimelineCard to render two adjacent sparklines.
 *
 * If `ticketTypeId` is provided, only that ticket's contribution is folded;
 * otherwise we sum across every ticket type in the bucket.
 */
export function buildTimelineSeries(
  buckets: SalesBucket[],
  ticketTypeId?: string
): TimelineSeries {
  const daily: TimelineSeries["daily"] = [];
  const cumulative: TimelineSeries["cumulative"] = [];

  let runQty = 0;
  let runRevenue = 0;

  for (const b of buckets) {
    let qty = 0;
    let revenue = 0;
    if (ticketTypeId) {
      const agg = b.perTicket[ticketTypeId];
      if (agg) {
        qty = agg.qty;
        revenue = agg.revenue;
      }
    } else {
      for (const agg of Object.values(b.perTicket)) {
        qty += agg.qty;
        revenue += agg.revenue;
      }
    }
    runQty += qty;
    runRevenue += revenue;
    daily.push({ date: b.date, qty, revenue });
    cumulative.push({ date: b.date, qty: runQty, revenue: runRevenue });
  }

  return {
    daily,
    cumulative,
    totals: { qty: runQty, revenue: runRevenue },
  };
}

/**
 * Project tomorrow-and-beyond at a given pace multiplier. Used by the
 * "what-if" scenarios — `multiplier=1` is "current pace", `1.5` is "+50%".
 *
 * Returns a continuation series starting one day after the last actual
 * bucket, projecting forward `daysAhead` days. Cumulative continues from
 * the actual cumulative; daily is constant `perDay * multiplier`.
 */
export function projectForward(
  series: TimelineSeries,
  perDay: number,
  multiplier: number,
  daysAhead: number
): TimelineSeries {
  const projDaily: TimelineSeries["daily"] = [];
  const projCumulative: TimelineSeries["cumulative"] = [];
  const last = series.daily.at(-1);
  if (!last || perDay <= 0 || daysAhead <= 0) {
    return { daily: [], cumulative: [], totals: { qty: 0, revenue: 0 } };
  }
  let runQty = series.totals.qty;
  // Revenue projection is best-effort: use the average revenue-per-qty seen
  // in the actual series. Falls back to zero if no qty was sold yet.
  const revPerQty =
    series.totals.qty > 0 ? series.totals.revenue / series.totals.qty : 0;
  let runRevenue = series.totals.revenue;

  const lastDate = new Date(`${last.date}T00:00:00Z`);
  const dailyQty = perDay * multiplier;
  const dailyRevenue = dailyQty * revPerQty;

  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(lastDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = toUtcDateString(d);
    runQty += dailyQty;
    runRevenue += dailyRevenue;
    projDaily.push({ date: dateStr, qty: dailyQty, revenue: dailyRevenue });
    projCumulative.push({ date: dateStr, qty: runQty, revenue: runRevenue });
  }

  return {
    daily: projDaily,
    cumulative: projCumulative,
    totals: {
      qty: runQty - series.totals.qty,
      revenue: runRevenue - series.totals.revenue,
    },
  };
}

/** Format a Date as `YYYY-MM-DD` in UTC. */
export function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generate a contiguous list of UTC date strings from `start` to `end`
 * inclusive. Used to "fill" the timeline with zero-buckets so charts have
 * a continuous x-axis even on quiet days.
 */
export function fillDateRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setUTCHours(0, 0, 0, 0);
  while (cur.getTime() <= stop.getTime()) {
    out.push(toUtcDateString(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Densify a sparse bucket list — inserts zero-buckets for any missing days
 * between the first and last actual bucket. Keeps caller code simple.
 */
export function densifyBuckets(buckets: SalesBucket[]): SalesBucket[] {
  if (buckets.length === 0) return [];
  const sorted = [...buckets].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = new Date(`${sorted[0].date}T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`);
  const dates = fillDateRange(start, end);
  const map = new Map(sorted.map((b) => [b.date, b]));
  return dates.map((date) => map.get(date) ?? { date, perTicket: {} });
}

/**
 * Format a number-of-days into a friendly relative string. Always hedged —
 * never reads as a precise countdown.
 */
export function formatDaysHedged(days: number): string {
  if (days < 0.5) return "later today";
  if (days < 1.5) return "in about a day";
  if (days < 6) return `in about ${Math.round(days)} days`;
  if (days < 14) return `in about ${Math.round(days)} days`;
  if (days < 60) return `in about ${Math.round(days / 7)} weeks`;
  return "in over two months";
}
