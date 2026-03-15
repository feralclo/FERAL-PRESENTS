"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  ShoppingBag,
  TrendingUp,
  Flame,
  Trophy,
} from "lucide-react";
import type { TopEventRow } from "./TopEventsTable";

interface EventSpotlightProps {
  events: TopEventRow[];
  currencySymbol: string;
  eventCapacity: Record<string, { sold: number; capacity: number }>;
}

function capacityColor(pct: number): string {
  if (pct >= 90) return "#F43F5E";
  if (pct >= 70) return "#FBBF24";
  if (pct >= 50) return "#34D399";
  return "#38BDF8";
}

function EventSpotlight({ events, currencySymbol, eventCapacity }: EventSpotlightProps) {
  return (
    <Card className="py-0 gap-0 flex flex-col h-full">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Event Spotlight
        </CardTitle>
        {events.length > 0 && events[0].sales > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1">
            <Trophy size={11} className="text-success" />
            <span className="text-[10px] font-bold text-success">Top seller</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 px-5 pb-5">
        {events.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20 ring-1 ring-border/30">
              <Flame size={18} className="text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground/50">No event activity today</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev, i) => {
              const conv = ev.views > 0 ? ((ev.sales / ev.views) * 100).toFixed(1) : "0.0";
              const isTopEvent = i === 0 && ev.views > 0;
              const cap = eventCapacity[ev.eventSlug];
              const hasCap = cap && cap.capacity > 0;
              const capPct = hasCap ? Math.min((cap.sold / cap.capacity) * 100, 100) : 0;
              const barColor = hasCap ? capacityColor(capPct) : "#34D399";
              const isUrgent = capPct >= 90;
              const isHot = capPct >= 70;

              return (
                <div
                  key={ev.eventSlug}
                  className={`rounded-xl border p-4 transition-all duration-300
                    ${isUrgent
                      ? "border-destructive/30 urgency-glow bg-destructive/[0.03]"
                      : isTopEvent
                        ? "border-primary/25 bg-gradient-to-br from-primary/[0.04] to-transparent"
                        : "border-border/40 bg-secondary/20"
                    }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {isHot && (
                        <Flame size={14} className={isUrgent ? "text-destructive" : "text-warning"} />
                      )}
                      <span className={`font-semibold text-foreground truncate ${isTopEvent ? "text-[15px]" : "text-[13px]"}`}>
                        {ev.eventName}
                      </span>
                    </div>
                    {ev.revenue > 0 && (
                      <span className="shrink-0 rounded-lg bg-success/12 px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums text-success">
                        {currencySymbol}{ev.revenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  {/* Capacity bar — thick and dramatic */}
                  {hasCap && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] text-muted-foreground">
                          <span className="font-mono font-bold tabular-nums text-foreground/90">{cap.sold}</span>
                          <span className="text-muted-foreground/40"> / {cap.capacity}</span>
                        </span>
                        <span
                          className="font-mono text-[12px] font-bold tabular-nums"
                          style={{ color: barColor }}
                        >
                          {Math.round(capPct)}% sold
                        </span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/80">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(capPct, 2)}%`,
                            backgroundColor: barColor,
                            boxShadow: capPct > 50 ? `0 0 8px ${barColor}40` : undefined,
                          }}
                        />
                        {/* Shimmer on high capacity */}
                        {capPct >= 70 && (
                          <div
                            className="absolute inset-0 rounded-full overflow-hidden"
                            style={{ width: `${capPct}%` }}
                          >
                            <div className="h-full w-[200%] bg-gradient-to-r from-transparent via-white/10 to-transparent capacity-shimmer" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-5 text-[12px]">
                    <span className="flex items-center gap-1.5">
                      <Eye size={13} className="text-muted-foreground/50" />
                      <span className="font-mono tabular-nums font-bold text-foreground/70">{ev.views.toLocaleString()}</span>
                      <span className="text-muted-foreground/40">views</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ShoppingBag size={13} className="text-success/50" />
                      <span className="font-mono tabular-nums font-bold text-foreground/70">{ev.sales.toLocaleString()}</span>
                      <span className="text-muted-foreground/40">orders</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <TrendingUp size={13} className="text-primary/50" />
                      <span className="font-mono tabular-nums font-bold text-foreground/70">{conv}%</span>
                      <span className="text-muted-foreground/40">conv</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { EventSpotlight };
