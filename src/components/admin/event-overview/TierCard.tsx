"use client";

import { TrendingUp, Clock } from "lucide-react";
import { MicroSparkline } from "@/components/admin/dashboard/MicroSparkline";
import { fmtMoney } from "@/lib/format";
import { relativeTimeShort } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import type { OverviewTicketType } from "./types";

/**
 * One ticket tier rendered as a self-contained card. Replaces the dense
 * "By ticket type" rows that lived inside SalesTimelineCard. Each card
 * answers four questions a host actually asks at a glance:
 *
 *   1. How are we doing? — sold count + capacity bar + sell-through %
 *   2. How fast? — per-day pace + 30-day spark + last-sold-at
 *   3. How much money? — revenue (kept tickets only — refunds excluded)
 *   4. Should I worry? — visual emphasis when sell-through > 80%
 *
 * Capacity bar tones:
 *   - green when ≥ 90% sold (almost there / sold out)
 *   - primary at ≥ 50% (healthy)
 *   - dim primary below 50%
 *   - empty grey for unlimited tiers (no capacity)
 *
 * Sparkline data comes from the per-bucket per-tier qty series so we
 * can show a tier's daily cadence even when other tiers spiked. We
 * accept up to 30 days of buckets — anything older gets clipped client-
 * side so the sparkline stays legible.
 */

interface TierCardProps {
  tier: OverviewTicketType;
  /** Daily qty values for this tier, oldest → newest. Already densified
   *  by the API. */
  dailyQty: number[];
  currency: string;
}

export function TierCard({ tier, dailyQty, currency }: TierCardProps) {
  const pct = tier.sellthrough_pct;
  const capacityKnown = tier.capacity != null;
  const isHot = pct != null && pct >= 80;
  const isSoldOut = pct != null && pct >= 100;

  const barTone =
    pct == null
      ? "bg-foreground/[0.08]"
      : pct >= 90
        ? "bg-success"
        : pct >= 50
          ? "bg-primary"
          : "bg-primary/55";

  const ringTone = isSoldOut
    ? "border-success/30"
    : isHot
      ? "border-primary/30"
      : "border-border/40";

  // Trim spark to last 30 days so micro-spark stays readable.
  const sparkData = dailyQty.slice(-30);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/40 px-4 py-4 transition-colors",
        ringTone
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-[14px] font-semibold leading-tight text-foreground">
            {tier.name}
          </h4>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground/80">
            {fmtMoney(tier.price, currency)} · {tier.status}
          </p>
        </div>
        {isSoldOut ? (
          <span className="inline-flex items-center rounded-full border border-success/30 bg-success/[0.08] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-success">
            Sold out
          </span>
        ) : isHot ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.08] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">
            <TrendingUp size={9} />
            Hot
          </span>
        ) : null}
      </div>

      {/* Headline: sold / capacity */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-[26px] font-bold leading-none tabular-nums text-foreground">
          {tier.sold.toLocaleString()}
        </span>
        {capacityKnown && (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            of {tier.capacity!.toLocaleString()}
          </span>
        )}
      </div>

      {/* Capacity bar (only when capacity is set) */}
      {capacityKnown && pct != null && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className={cn("h-full transition-all", barTone)}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground/80">
            {pct}% sold
          </p>
        </div>
      )}

      {/* Revenue */}
      <p className="mt-3 font-mono text-[13px] font-semibold tabular-nums text-success">
        {fmtMoney(tier.revenue_completed, currency)}
      </p>

      {/* Footer row: pace + last sold + spark */}
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-mono text-[10px] tabular-nums text-muted-foreground/80">
            {tier.per_day_7d > 0 ? (
              <>{tier.per_day_7d.toFixed(1)}/day · last 7d</>
            ) : (
              "no sales last 7d"
            )}
          </p>
          {tier.last_sold_at && (
            <p className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground/80">
              <Clock size={9} />
              last sold {relativeTimeShort(tier.last_sold_at)}
            </p>
          )}
        </div>
        {sparkData.some((v) => v > 0) && (
          <MicroSparkline
            data={sparkData}
            color="#A78BFA"
            width={96}
            height={24}
            variant="bar"
            className="shrink-0"
          />
        )}
      </div>
    </div>
  );
}
