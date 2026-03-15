"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import type { TopEventRow } from "./TopEventsTable";

interface EventSpotlightProps {
  events: TopEventRow[];
  currencySymbol: string;
  eventCapacity: Record<string, { sold: number; capacity: number }>;
}

function capacityColor(pct: number): string {
  if (pct >= 90) return "#F43F5E"; // red/urgency
  if (pct >= 70) return "#FBBF24"; // amber
  return "#34D399"; // green
}

function EventSpotlight({ events, currencySymbol, eventCapacity }: EventSpotlightProps) {
  return (
    <Card className="py-0 gap-0 flex flex-col h-full">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Event Spotlight
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-5 pb-5">
        {events.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
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

              return (
                <div
                  key={ev.eventSlug}
                  className={`rounded-lg border p-3 transition-all duration-300
                    ${isUrgent
                      ? "border-destructive/30 urgency-glow"
                      : isTopEvent
                        ? "border-primary/20 bg-primary/[0.03]"
                        : "border-border/40 bg-secondary/20"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[13px] font-semibold text-foreground truncate">
                      {ev.eventName}
                    </span>
                    {ev.revenue > 0 && (
                      <span className="shrink-0 rounded-md bg-success/12 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-success">
                        {currencySymbol}{ev.revenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  {/* Capacity bar */}
                  {hasCap && (
                    <div className="mb-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-muted-foreground">
                          <span className="font-mono font-semibold tabular-nums text-foreground/80">{cap.sold}</span>/{cap.capacity} tickets
                        </span>
                        <span
                          className="font-mono text-[11px] font-bold tabular-nums"
                          style={{ color: barColor }}
                        >
                          {Math.round(capPct)}% sold
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(capPct, 2)}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye size={12} className="text-muted-foreground/60" />
                      <span className="font-mono tabular-nums font-semibold text-foreground/70">{ev.views.toLocaleString()}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ShoppingBag size={12} className="text-success/60" />
                      <span className="font-mono tabular-nums font-semibold text-foreground/70">{ev.sales.toLocaleString()}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <TrendingUp size={12} className="text-primary/60" />
                      <span className="font-mono tabular-nums font-semibold text-foreground/70">{conv}%</span>
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
