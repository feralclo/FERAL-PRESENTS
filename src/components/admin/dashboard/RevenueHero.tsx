"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MicroSparkline } from "./MicroSparkline";
import { useCountUp } from "@/hooks/useCountUp";
import { ArrowUp, ArrowDown, ShoppingBag, Ticket, TrendingUp, Clock } from "lucide-react";
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
  const pctChange = yesterdayRevenue > 0 ? ((revDiff / yesterdayRevenue) * 100) : 0;
  const isUp = revDiff > 0;
  const isDown = revDiff < 0;

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

  const stats = [
    { icon: ShoppingBag, label: "Orders", value: orders.toLocaleString() },
    { icon: Ticket, label: "Tickets", value: ticketsSold.toLocaleString() },
    { icon: TrendingUp, label: "Avg", value: `${currencySymbol}${avgOrderValue.toFixed(2)}` },
    ...(peakInfo.value > 0 ? [{ icon: Clock, label: "Peak", value: `${peakInfo.hour.toString().padStart(2, "0")}:00` }] : []),
  ];

  return (
    <Card
      className={`py-0 gap-0 overflow-hidden transition-all duration-500 ${
        lastSale
          ? "border-success/40 shadow-[0_0_40px_rgba(52,211,153,0.1)]"
          : "border-border/60"
      }`}
    >
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Left: Revenue */}
          <div className="flex-1 p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Today&apos;s Revenue
              </p>
              {!isLoading && pctChange !== 0 && (
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    isUp ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"
                  }`}
                >
                  {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                  {Math.abs(pctChange).toFixed(0)}%
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
              <div className="mt-3 flex items-center gap-2 milestone-in">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="text-[13px] font-semibold text-success">
                  +{currencySymbol}{lastSale.amount.toFixed(2)}
                </span>
                <span className="text-[12px] text-muted-foreground">{lastSale.orderNumber}</span>
              </div>
            )}

            {/* Stats row */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {stats.map((stat) => {
                const SIcon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2"
                  >
                    <SIcon size={13} strokeWidth={1.5} className="text-muted-foreground/50" />
                    <span className="text-[11px] text-muted-foreground/60">{stat.label}</span>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/80">{stat.value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Hourly chart */}
          <div className="flex flex-col justify-end bg-secondary/20 p-6 lg:w-[300px] lg:p-8">
            <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/50">
              Revenue by hour
            </p>
            <div className="flex-1 flex items-end">
              {visibleHours.length > 0 ? (
                <MicroSparkline
                  data={visibleHours}
                  color="#34D399"
                  height={80}
                  width={260}
                  variant="bar"
                  className="w-full"
                  animate
                />
              ) : (
                <div className="flex h-20 w-full items-end gap-1">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="flex-1 h-2 rounded-sm bg-muted/10" />
                  ))}
                </div>
              )}
            </div>
            {visibleHours.length > 0 && (
              <div className="mt-2 flex justify-between text-[9px] font-mono text-muted-foreground/30 tabular-nums">
                <span>00</span>
                {currentHour > 6 && <span>{Math.floor(currentHour / 2).toString().padStart(2, "0")}</span>}
                <span>{currentHour.toString().padStart(2, "0")}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { RevenueHero };
