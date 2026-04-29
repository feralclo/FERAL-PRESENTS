"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { MicroSparkline } from "@/components/admin/dashboard/MicroSparkline";
import { AdminBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/stripe/config";
import {
  buildTimelineSeries,
  projectForward,
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
 *   2. Per-ticket-type rows below: each tier's daily cadence and its
 *      total. Helps the host see which tier is driving sales.
 *
 * Phase 4.6 (what-if scenarios) layers a hover toggle that projects the
 * cumulative line forward at 1× / 1.5× / 2× the current pace. Restraint:
 * a single thin projected line, not an interactive simulator. If the
 * projection contradicts plain reading (zero velocity, 0 days remaining),
 * we hide the toggle entirely.
 */

interface Props {
  buckets: SalesBucket[];
  ticketTypes: { id: string; name: string }[];
  currency: string;
  loading?: boolean;
}

export function SalesTimelineCard({
  buckets,
  ticketTypes,
  currency,
  loading,
}: Props) {
  const totals = useMemo(() => buildTimelineSeries(buckets), [buckets]);
  const velocity = useMemo(
    () => velocityByTicket(buckets, 7, new Date()),
    [buckets]
  );

  // Aggregate velocity across the whole event — used for the headline
  // "tickets/day" line. Sum each per-ticket sample.
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

  const [whatIf, setWhatIf] = useState<1 | 1.5 | 2>(1);

  // Projection — only shown when there's something to project.
  const projection = useMemo(() => {
    if (eventVelocity.perDay <= 0) return null;
    if (whatIf === 1) return null; // baseline matches the actual line; redundant
    return projectForward(totals, eventVelocity.perDay, whatIf, 14);
  }, [totals, eventVelocity.perDay, whatIf]);

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
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
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
          />
          {projection && (
            <ProjectionOverlay
              actualLength={totals.cumulative.length}
              projectedQty={projection.cumulative.map((b) => b.qty)}
              maxValue={Math.max(
                ...totals.cumulative.map((b) => b.qty),
                ...projection.cumulative.map((b) => b.qty),
                1
              )}
            />
          )}
        </ChartBlock>
        <ChartBlock label="Daily">
          <MicroSparkline
            data={totals.daily.map((b) => b.qty)}
            color="#34D399"
            width={300}
            height={56}
            variant="bar"
          />
        </ChartBlock>
      </div>

      {/* What-if scenarios — only when there's velocity to project. */}
      {eventVelocity.perDay > 0 && (
        <div className="flex items-center gap-3 border-t border-border/30 pt-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
            What if
          </span>
          <div className="inline-flex items-center rounded-md border border-border bg-secondary/40 p-0.5">
            {[1, 1.5, 2].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWhatIf(m as 1 | 1.5 | 2)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium tabular-nums transition-all",
                  whatIf === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === 1 ? "Current pace" : `${m}× pace`}
              </button>
            ))}
          </div>
          {projection && (
            <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
              + {Math.round(projection.totals.qty)} tickets ·{" "}
              {formatPrice(Math.round(projection.totals.revenue), currency)}{" "}
              over the next 14 days
            </span>
          )}
          {whatIf === 1 && (
            <span className="text-[11px] text-muted-foreground">
              Pick 1.5× or 2× to overlay a projection.
            </span>
          )}
        </div>
      )}

      {/* Per-ticket-type rows */}
      {ticketTypes.length > 1 && (
        <div className="space-y-1.5 border-t border-border/30 pt-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            By ticket type
          </p>
          {ticketTypes.map((tt) => {
            const series = buildTimelineSeries(buckets, tt.id);
            const sample = velocity.get(tt.id);
            if (series.totals.qty === 0 && (!sample || sample.qty === 0)) {
              return null;
            }
            return (
              <div
                key={tt.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-foreground/[0.02] transition-colors"
              >
                <span className="flex-1 truncate text-xs text-foreground/85">
                  {tt.name}
                </span>
                <MicroSparkline
                  data={series.daily.map((b) => b.qty)}
                  color="#A78BFA"
                  width={120}
                  height={20}
                  variant="bar"
                />
                <span className="font-mono tabular-nums text-[11px] text-foreground/85 w-12 text-right">
                  {series.totals.qty}
                </span>
                {sample && sample.perDay > 0 && (
                  <span className="font-mono tabular-nums text-[10px] text-muted-foreground/70 w-16 text-right">
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

/**
 * Projection overlay — a thin dashed line continuing the cumulative
 * sparkline forward. Drawn manually over the MicroSparkline so we don't
 * have to touch the existing sparkline component (which is shared with
 * the dashboard).
 */
function ProjectionOverlay({
  actualLength,
  projectedQty,
  maxValue,
}: {
  actualLength: number;
  projectedQty: number[];
  maxValue: number;
}) {
  if (projectedQty.length === 0) return null;
  const width = 300;
  const height = 56;
  const pad = 2;
  const totalLen = actualLength + projectedQty.length;

  // Continue from where the actual line ends.
  const startX = pad + ((actualLength - 1) / Math.max(totalLen - 1, 1)) * (width - pad * 2);
  const points = projectedQty.map((v, i) => {
    const x =
      pad +
      ((actualLength + i) / Math.max(totalLen - 1, 1)) * (width - pad * 2);
    const y =
      pad + (height - pad * 2) - (v / maxValue) * (height - pad * 2);
    return { x, y };
  });
  const last = points[points.length - 1];

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${startX} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={pathD}
        fill="none"
        stroke="#A78BFA"
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill="#A78BFA" opacity={0.7} />
    </svg>
  );
}
