/**
 * Plain-English event status summariser. Takes the same data the
 * overview page renders and returns one human sentence + a sub-line.
 * The point: a non-technical promoter should be able to answer "how
 * are we doing?" without reading a single chart.
 *
 * Design principle: write like a friend texting an update, not a
 * dashboard. Round numbers, no jargon ("conversion", "WoW", "sellthrough"),
 * no acronyms. The mood drives the colour tone of the hero card.
 */

export type EventSummaryMood =
  | "great" // selling fast, on track for sellout
  | "good" // healthy progress
  | "neutral" // factual / informational
  | "concern" // sales slowing, time short
  | "sold_out" // 100%+ sold
  | "pending"; // just launched, no sales yet

export interface EventSummary {
  headline: string;
  subline: string;
  mood: EventSummaryMood;
}

interface SummaryInput {
  status: string;
  date_start: string;
  capacity: number | null;
  totals: {
    sold: number;
    revenue: number;
  };
  windows: {
    today: { sold: number; revenue: number };
    last_7d: { sold: number; revenue: number };
    prev_7d: { sold: number; revenue: number };
  };
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** "Sat 5 May" — the format we already use elsewhere on the editor. */
function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Trend sub-line built from week-over-week comparison. */
function buildTrendLine(
  last7Sold: number,
  prev7Sold: number,
  todaySold: number
): string | null {
  if (todaySold > 0 && last7Sold === todaySold) {
    return "First sale this week — keep going";
  }
  if (last7Sold > 0 && prev7Sold === 0) {
    return "Strong week — first week with sales";
  }
  if (last7Sold === 0 && prev7Sold > 0) {
    return "Quiet week — no sales in 7 days";
  }
  if (last7Sold > 0 && prev7Sold > 0) {
    const pct = ((last7Sold - prev7Sold) / prev7Sold) * 100;
    if (pct >= 15) return `Up ${Math.round(pct)}% on last week`;
    if (pct <= -15) return `Down ${Math.round(Math.abs(pct))}% on last week`;
    return "Steady week on week";
  }
  return null;
}

export function summariseEvent(input: SummaryInput): EventSummary {
  const { status, date_start, capacity, totals, windows } = input;
  const eventDate = new Date(date_start);
  const eventDateMs = eventDate.getTime();
  const now = Date.now();
  const daysUntil = (eventDateMs - now) / DAY_MS;
  const isPast = daysUntil < 0.5;
  const sellthrough = capacity && capacity > 0 ? totals.sold / capacity : null;
  const isSoldOut = sellthrough != null && sellthrough >= 1;

  // Cancelled / archived — special handling.
  if (status === "cancelled") {
    return {
      headline: "Event cancelled",
      subline: `${totals.sold.toLocaleString()} ticket${totals.sold === 1 ? "" : "s"} were sold`,
      mood: "neutral",
    };
  }
  if (status === "archived") {
    return {
      headline: "Event archived",
      subline: "Hidden from the dashboard, kept for records.",
      mood: "neutral",
    };
  }

  // Past event — shows the final tally.
  if (isPast) {
    if (totals.sold === 0) {
      return {
        headline: "Event done",
        subline: "No tickets sold this time round",
        mood: "neutral",
      };
    }
    return {
      headline: "Event done",
      subline:
        sellthrough != null
          ? `${totals.sold.toLocaleString()} sold · ${Math.round(sellthrough * 100)}% of capacity`
          : `${totals.sold.toLocaleString()} ticket${totals.sold === 1 ? "" : "s"} sold`,
      mood: "neutral",
    };
  }

  // Sold out — celebrate.
  if (isSoldOut) {
    return {
      headline: "Sold out",
      subline:
        daysUntil > 1
          ? `Every ticket gone with ${Math.round(daysUntil)} day${Math.round(daysUntil) === 1 ? "" : "s"} to go — set up a waitlist if you haven't.`
          : "Every ticket gone — well done.",
      mood: "sold_out",
    };
  }

  const trendLine = buildTrendLine(
    windows.last_7d.sold,
    windows.prev_7d.sold,
    windows.today.sold
  );

  // No sales yet.
  if (totals.sold === 0) {
    if (daysUntil > 14) {
      return {
        headline: "Just launched",
        subline: "Share your event to get the first sales coming in",
        mood: "pending",
      };
    }
    if (daysUntil > 3) {
      return {
        headline: "No sales yet",
        subline: `${Math.round(daysUntil)} days to go — time to start sharing`,
        mood: "concern",
      };
    }
    return {
      headline: "No sales yet — and your event is soon",
      subline: `Only ${Math.round(daysUntil)} day${Math.round(daysUntil) === 1 ? "" : "s"} to go`,
      mood: "concern",
    };
  }

  // Pace-based projection.
  const perDay = windows.last_7d.sold / 7;
  const projectedExtra = perDay * Math.max(0, daysUntil);
  const projectedTotal = totals.sold + projectedExtra;

  // Will sell out at current pace.
  if (capacity != null && projectedTotal >= capacity * 0.95) {
    const ticketsLeft = Math.max(0, capacity - totals.sold);
    return {
      headline: `On track to sell out by ${shortDate(eventDate)}`,
      subline:
        trendLine ||
        `${ticketsLeft.toLocaleString()} ticket${ticketsLeft === 1 ? "" : "s"} to go · ${Math.round(daysUntil)} day${Math.round(daysUntil) === 1 ? "" : "s"} until your event`,
      mood: "great",
    };
  }

  // Slow pace — projection well below capacity.
  if (capacity != null && perDay > 0 && projectedTotal < capacity * 0.6) {
    return {
      headline: "Sales could use a push",
      subline: `At this pace you'll sell about ${Math.round(projectedTotal).toLocaleString()} of ${capacity.toLocaleString()} — share to drive more.`,
      mood: "concern",
    };
  }

  // No-recent-sales nudge.
  if (windows.last_7d.sold === 0 && windows.prev_7d.sold > 0) {
    return {
      headline: "Sales have stalled this week",
      subline: `${totals.sold.toLocaleString()} sold so far — a fresh post often gets things moving again.`,
      mood: "concern",
    };
  }

  // Healthy mid-progress with capacity.
  if (sellthrough != null) {
    const pct = Math.round(sellthrough * 100);
    const ticketsLeft = Math.max(0, (capacity ?? 0) - totals.sold);
    return {
      headline: `${pct}% sold — going strong`,
      subline:
        trendLine ||
        `${ticketsLeft.toLocaleString()} ticket${ticketsLeft === 1 ? "" : "s"} to go · ${Math.round(daysUntil)} day${Math.round(daysUntil) === 1 ? "" : "s"} until your event`,
      mood: "good",
    };
  }

  // Unlimited-capacity event — talk about cadence.
  return {
    headline: `${totals.sold.toLocaleString()} ticket${totals.sold === 1 ? "" : "s"} sold so far`,
    subline:
      trendLine ||
      `${Math.round(daysUntil)} day${Math.round(daysUntil) === 1 ? "" : "s"} until your event`,
    mood: "good",
  };
}

/**
 * Plain-English "today vs yesterday" helper used by the Today KPI.
 * Returns a short comparison string, not a percentage.
 */
export function todayVsRecentLabel(
  todaySold: number,
  last7Sold: number
): string {
  if (todaySold === 0) return "no sales today";
  const recentAvgPerDay = last7Sold / 7;
  if (recentAvgPerDay === 0) return "first sales this week";
  const ratio = todaySold / recentAvgPerDay;
  if (ratio >= 1.6) return "best day this week";
  if (ratio >= 1.1) return "above your usual pace";
  if (ratio >= 0.7) return "in line with this week";
  return "slower than usual today";
}
