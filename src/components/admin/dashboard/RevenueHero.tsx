"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendBadge } from "@/components/ui/trend-badge";
import { MicroSparkline } from "./MicroSparkline";
import { useCountUp } from "@/hooks/useCountUp";
import type { LastSale } from "@/hooks/useDashboardRealtime";

interface RevenueHeroProps {
  revenue: number;
  yesterdayRevenue: number;
  orders: number;
  ticketsSold: number;
  avgOrderValue: number;
  hourlyRevenue: number[];
  currencySymbol: string;
  lastSale: LastSale | null;
  isLoading: boolean;
}

function RevenueHero({
  revenue,
  yesterdayRevenue,
  orders,
  ticketsSold,
  avgOrderValue,
  hourlyRevenue,
  currencySymbol,
  lastSale,
  isLoading,
}: RevenueHeroProps) {
  const animatedRevenue = useCountUp(Math.round(revenue * 100), 1200, !isLoading);
  const displayRevenue = (animatedRevenue / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const currentHour = new Date().getHours();

  const peakInfo = useMemo(() => {
    let peakHour = 0;
    let peakVal = 0;
    for (let i = 0; i < hourlyRevenue.length; i++) {
      if (hourlyRevenue[i] > peakVal) {
        peakVal = hourlyRevenue[i];
        peakHour = i;
      }
    }
    return { hour: peakHour, value: peakVal };
  }, [hourlyRevenue]);

  // Only show hours up to current hour + 1 for sparkline
  const visibleHours = hourlyRevenue.slice(0, currentHour + 1);

  return (
    <Card className="py-0 gap-0 overflow-hidden border-border/60">
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          {/* Left: Revenue number */}
          <div className="flex-1 p-6 lg:p-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Today&apos;s Revenue
            </p>
            <div className="mt-3 flex items-baseline gap-3">
              <p
                className={`font-mono text-4xl font-bold tabular-nums tracking-tight text-foreground transition-all duration-300 lg:text-5xl ${
                  lastSale ? "text-success dashboard-pulse" : ""
                }`}
              >
                {isLoading ? "\u00A0" : `${currencySymbol}${displayRevenue}`}
              </p>
              {!isLoading && (
                <TrendBadge
                  value={revenue - yesterdayRevenue}
                  format="currency"
                  currencySymbol={currencySymbol}
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
              <span>
                <span className="font-mono font-semibold tabular-nums text-foreground/80">{orders}</span> orders
              </span>
              <span>
                <span className="font-mono font-semibold tabular-nums text-foreground/80">{ticketsSold}</span> tickets
              </span>
              <span>
                {currencySymbol}
                <span className="font-mono font-semibold tabular-nums text-foreground/80">
                  {avgOrderValue.toFixed(2)}
                </span>{" "}
                avg
              </span>
              {peakInfo.value > 0 && (
                <span>
                  Peak:{" "}
                  <span className="font-mono font-semibold tabular-nums text-foreground/80">
                    {peakInfo.hour.toString().padStart(2, "0")}:00
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Right: Hourly sparkline */}
          <div className="flex items-end border-t border-border/30 p-6 lg:w-[280px] lg:border-l lg:border-t-0 lg:p-8">
            <div className="w-full">
              <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/60">
                Hourly Revenue
              </p>
              {visibleHours.length > 0 ? (
                <MicroSparkline
                  data={visibleHours}
                  color="#34D399"
                  height={48}
                  width={240}
                  variant="bar"
                  className="w-full"
                />
              ) : (
                <div className="flex h-12 items-end gap-[2px]">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="h-2 w-3 rounded-sm bg-muted/20" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { RevenueHero };
