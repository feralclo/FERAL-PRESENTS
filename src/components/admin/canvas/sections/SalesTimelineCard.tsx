"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { MicroSparkline } from "@/components/admin/dashboard/MicroSparkline";
import { AdminBadge } from "@/components/admin/ui";
import { formatPrice } from "@/lib/stripe/config";
import {
  buildTimelineSeries,
  velocityByTicket,
  type SalesBucket,
} from "@/lib/sales-velocity";

/**
 * Sales timeline — cumulative + daily velocity for one event.
 *
 * Read-only feature on top of the orders timeline. Host opens it during a
 * sale week to answer "is this working?" without doing the math.
 *
 * Two layers:
 *   1. Combined event totals: cumulative line + daily bars + a velocity
 *      pill ("12.4 tickets/day over the last 7 days").
 *   2. Per-ticket-type rows: each tier's daily cadence + total + per-day
 *      pace. Helps the host see which tier is driving sales.
 *
 * Below that, a single anchored projection: "At this pace you'll reach
 * ~N tickets by {event date}". One sentence. No 1.5× / 2× toggle —
 * sliders without anchored meaning are toy-flavoured. The event date is
 * the anchor every host actually cares about.
 */

interface Props {
  buckets: SalesBucket[];
  ticketTypes: { id: string; name: string }[];
  currency: string;
  /** Event start ISO — used for the "by event date" projection sentence.
   *  Null/undefined hides the projection (drafts before a date is set). */
  eventDateStart?: string | null;
  loading?: boolean;
}

export function SalesTimelineCard({
  buckets,
  ticketTypes,
  currency,
  eventDateStart,
  loading,
}: Props) {
  const totals = useMemo(() => buildTimelineSeries(buckets), [buckets]);
  const velocity = useMemo(
    () => velocityByTicket(buckets, 7, new Date()),
    [buckets]
  );

  // Aggregate per-day across the whole event for the headline line.
  const eventVelocity = useMemo(() => {
    let qty = 0;
    let perDay = 0;
    let windowDays = 0;
    for (const sample of velocity.values()) {
      qty += sample.qty;
      perDay += sample.perDay;
      windowDays = Math.max(windowDays, sample.windowDays);
    }
    return { qty, perDay, windowDays };
  }, [velocity]);

  // Per-tier series — memoised once per bucket payload + ticketTypes set so
  // we don't refold on every render. Returns an array aligned with
  // `ticketTypes` so the JSX can map by index.
  const perTierSeries = useMemo(
    () => ticketTypes.map((tt) => buildTimelineSeries(buckets, tt.id)),
    [buckets, ticketTypes]
  );

  // Projection at current pace, anchored to the event date. Hide when
  // velocity is zero, the event has no date set, or the date has passed —
  // a projection that points to yesterday is worse than no projection.
  const projectionLine = useMemo(() => {
    if (!eventDateStart || eventVelocity.perDay <= 0) return null;
    const eventDate = new Date(eventDateStart);
    if (isNaN(eventDate.getTime())) return null;
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntil = (eventDate.getTime() - now.getTime()) / msPerDay;
    if (daysUntil <= 0.5) return null;

    const projectedAdditional = eventVelocity.perDay * daysUntil;
    const projectedTotal = totals.totals.qty + projectedAdditional;
    return {
      total: Math.round(projectedTotal),
      additional: Math.round(projectedAdditional),
      eventDate,
      daysUntil,
    };
  }, [eventDateStart, eventVelocity.perDay, totals.totals.qty]);

  const hasData = buckets.length > 0 && totals.totals.qty > 0;

  if (loading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
            Sales timeline
          </span>
        </div>
        <div className="mt-3 h-24 animate-pulse rounded-md bg-foreground/[0.04]" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-5">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-muted-foreground/50" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
            Sales timeline
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          No sales yet. The timeline will appear here once your first
          ticket is sold.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-4 space-y-4">
      {/* Header — wraps cleanly at 375px because the badge sits at the
          start of the second line, not pinned to the right. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Sales timeline
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
            {totals.totals.qty.toLocaleString()} ticket
            {totals.totals.qty === 1 ? "" : "s"} sold
          </h3>
          <p className="mt-1 font-mono tabular-nums text-xs text-muted-foreground">
            {formatPrice(Math.round(totals.totals.revenue), currency)} ·{" "}
            {eventVelocity.perDay.toFixed(1)}/day over the last{" "}
            {eventVelocity.windowDays} day
            {eventVelocity.windowDays === 1 ? "" : "s"}
          </p>
        </div>
        {eventVelocity.perDay > 0 && (
          <AdminBadge variant="success" className="gap-1.5 self-start">
            <TrendingUp size={11} />
            {eventVelocity.perDay >= 1
              ? `${eventVelocity.perDay.toFixed(1)}/day`
              : `${(eventVelocity.perDay * 7).toFixed(1)}/wk`}
          </AdminBadge>
        )}
      </div>

      {/* Cumulative + daily charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartBlock label="Cumulative">
          <MicroSparkline
            data={totals.cumulative.map((b) => b.qty)}
            color="#A78BFA"
            width={300}
            height={56}
            variant="area"
            showDot
            className="w-full"
          />
        </ChartBlock>
        <ChartBlock label="Daily">
          <MicroSparkline
            data={totals.daily.map((b) => b.qty)}
            color="#34D399"
            width={300}
            height={56}
            variant="bar"
            className="w-full"
          />
        </ChartBlock>
      </div>

      {/* Anchored projection — one sentence, anchored to the actual event
          date the host already cares about. Hidden when there's nothing
          honest to say. */}
      {projectionLine && (
        <p className="border-t border-border/30 pt-3 text-xs text-muted-foreground">
          At this pace you&rsquo;ll reach{" "}
          <span className="font-mono font-semibold tabular-nums text-foreground">
            ~{projectionLine.total.toLocaleString()}
          </span>{" "}
          tickets by{" "}
          <span className="font-mono tabular-nums text-foreground/85">
            {formatEventDate(projectionLine.eventDate)}
          </span>
          {projectionLine.additional > 0 && (
            <>
              {" "}— that&rsquo;s{" "}
              <span className="font-mono tabular-nums">
                +{projectionLine.additional.toLocaleString()}
              </span>{" "}
              from now.
            </>
          )}
        </p>
      )}

      {/* Per-ticket-type rows — only when there's more than one tier */}
      {ticketTypes.length > 1 && (
        <div className="space-y-1.5 border-t border-border/30 pt-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            By ticket type
          </p>
          {ticketTypes.map((tt, i) => {
            const series = perTierSeries[i];
            const sample = velocity.get(tt.id);
            if (series.totals.qty === 0 && (!sample || sample.qty === 0)) {
              return null;
            }
            return (
              <div
                key={tt.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-foreground/[0.02] transition-colors"
              >
                <span className="flex-1 truncate text-xs text-foreground/85 min-w-0">
                  {tt.name}
                </span>
                <MicroSparkline
                  data={series.daily.map((b) => b.qty)}
                  color="#A78BFA"
                  width={120}
                  height={20}
                  variant="bar"
                  className="hidden sm:block shrink-0"
                />
                <span className="font-mono tabular-nums text-[11px] text-foreground/85 w-10 text-right shrink-0">
                  {series.totals.qty}
                </span>
                {sample && sample.perDay > 0 && (
                  <span className="font-mono tabular-nums text-[10px] text-muted-foreground/70 w-16 text-right shrink-0">
                    {sample.perDay.toFixed(1)}/day
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChartBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </p>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Friendly long-form date for the projection sentence: "Sat 5 May". */
function formatEventDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
