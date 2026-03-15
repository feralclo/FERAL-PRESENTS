"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendBadge } from "@/components/ui/trend-badge";
import { MicroSparkline } from "./MicroSparkline";
import { SaleConfetti } from "./SaleConfetti";
import { useCountUp } from "@/hooks/useCountUp";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
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
  const visibleHours = hourlyRevenue.slice(0, currentHour + 1);
  const revDiff = revenue - yesterdayRevenue;

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

  // Revenue change percentage
  const pctChange = yesterdayRevenue > 0 ? ((revDiff / yesterdayRevenue) * 100) : 0;
  const isUp = revDiff > 0;
  const isDown = revDiff < 0;

  return (
    <Card
      className={`relative py-0 gap-0 overflow-hidden transition-all duration-500 ${
        lastSale
          ? "border-success/40 shadow-[0_0_40px_rgba(52,211,153,0.12)]"
          : "border-border/60"
      }`}
    >
      {/* Sale celebration confetti */}
      {lastSale && (
        <div className="absolute top-4 right-4 z-10">
          <SaleConfetti />
        </div>
      )}

      <CardContent className="p-0">
        {/* Full-width hourly sparkline as subtle background */}
        <div className="absolute bottom-0 left-0 right-0 opacity-30 pointer-events-none">
          {visibleHours.length > 0 && (
            <MicroSparkline
              data={visibleHours}
              color={isUp ? "#34D399" : isDown ? "#F43F5E" : "#8B5CF6"}
              height={100}
              width={800}
              variant="area"
              className="w-full"
            />
          )}
        </div>

        <div className="relative z-[1] flex flex-col lg:flex-row lg:items-stretch">
          {/* Left: Revenue number — the star */}
          <div className="flex-1 p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Today&apos;s Revenue
              </p>
              {!isLoading && pctChange !== 0 && (
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    isUp
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                  {Math.abs(pctChange).toFixed(0)}% vs yesterday
                </span>
              )}
            </div>

            <p
              className={`font-mono text-5xl font-bold tabular-nums tracking-tight text-foreground transition-all duration-300 lg:text-6xl ${
                lastSale ? "text-success dashboard-pulse" : ""
              }`}
            >
              {isLoading ? (
                <span className="inline-block h-14 w-48 animate-pulse rounded-lg bg-muted/30" />
              ) : (
                `${currencySymbol}${displayRevenue}`
              )}
            </p>

            {/* Last sale flash */}
            {lastSale && (
              <div className="mt-2 flex items-center gap-2 milestone-in">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="text-[13px] font-semibold text-success">
                  +{currencySymbol}{lastSale.amount.toFixed(2)}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {lastSale.orderNumber}
                </span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2">
              <StatPill label="orders" value={orders} />
              <StatPill label="tickets" value={ticketsSold} />
              <StatPill label="avg" value={`${currencySymbol}${avgOrderValue.toFixed(2)}`} />
              {peakInfo.value > 0 && (
                <StatPill label="peak" value={`${peakInfo.hour.toString().padStart(2, "0")}:00`} />
              )}
            </div>
          </div>

          {/* Right: Hourly revenue bars — tall and dramatic */}
          <div className="flex items-end border-t border-border/20 p-6 lg:w-[320px] lg:border-l lg:border-t-0 lg:p-8">
            <div className="w-full">
              <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/60">
                Revenue by hour
              </p>
              {visibleHours.length > 0 ? (
                <MicroSparkline
                  data={visibleHours}
                  color="#34D399"
                  height={80}
                  width={270}
                  variant="bar"
                  className="w-full"
                  animate
                />
              ) : (
                <div className="flex h-20 items-end gap-[3px]">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-3 w-4 rounded-sm bg-muted/15" />
                  ))}
                </div>
              )}
              {/* Hour labels */}
              {visibleHours.length > 0 && (
                <div className="mt-1.5 flex justify-between text-[9px] font-mono text-muted-foreground/40 tabular-nums">
                  <span>00:00</span>
                  <span>{currentHour.toString().padStart(2, "0")}:00</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-[12px]">
      <span className="font-mono font-bold tabular-nums text-foreground/90">{value}</span>
      <span className="text-muted-foreground/60">{label}</span>
    </span>
  );
}

export { RevenueHero };
