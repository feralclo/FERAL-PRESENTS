"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  Ticket,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

interface FunnelStats {
  landing: number;
  tickets: number;
  add_to_cart: number;
  checkout: number;
  purchase: number;
}

interface BuyerJourneyProps {
  funnel: FunnelStats;
}

const STAGES: {
  key: keyof FunnelStats;
  label: string;
  shortLabel: string;
  tooltip: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  color: string;
  iconColor: string;
  bg: string;
  ring: string;
  barColor: string;
}[] = [
  {
    key: "landing",
    label: "Page Views",
    shortLabel: "Views",
    tooltip: "Visitors who landed on an event page",
    icon: Eye,
    color: "text-muted-foreground",
    iconColor: "#8888a0",
    bg: "bg-muted/30",
    ring: "ring-border/40",
    barColor: "bg-muted-foreground/30",
  },
  {
    key: "tickets",
    label: "Viewed Tickets",
    shortLabel: "Tickets",
    tooltip: "Scrolled down to the ticket selection area",
    icon: Ticket,
    color: "text-info",
    iconColor: "#38BDF8",
    bg: "bg-info/8",
    ring: "ring-info/15",
    barColor: "bg-info/40",
  },
  {
    key: "add_to_cart",
    label: "Added to Cart",
    shortLabel: "Cart",
    tooltip: "Selected tickets or merch and added to cart",
    icon: ShoppingCart,
    color: "text-warning",
    iconColor: "#FBBF24",
    bg: "bg-warning/8",
    ring: "ring-warning/15",
    barColor: "bg-warning/40",
  },
  {
    key: "checkout",
    label: "Checkout",
    shortLabel: "Checkout",
    tooltip: "Entered the payment flow",
    icon: CreditCard,
    color: "text-primary",
    iconColor: "#8B5CF6",
    bg: "bg-primary/8",
    ring: "ring-primary/15",
    barColor: "bg-primary/40",
  },
  {
    key: "purchase",
    label: "Purchased",
    shortLabel: "Sold",
    tooltip: "Completed payment successfully",
    icon: CheckCircle2,
    color: "text-success",
    iconColor: "#34D399",
    bg: "bg-success/10",
    ring: "ring-success/20",
    barColor: "bg-success/50",
  },
];

function convRate(from: number, to: number): string {
  if (from <= 0 || to <= 0) return "";
  return `${((to / from) * 100).toFixed(0)}%`;
}

function BuyerJourney({ funnel }: BuyerJourneyProps) {
  const overallConv = funnel.landing > 0 ? ((funnel.purchase / funnel.landing) * 100).toFixed(1) : "0.0";
  const maxCount = Math.max(...STAGES.map((s) => funnel[s.key]), 1);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Buyer Journey
        </CardTitle>
        <div className="flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1.5">
          <TrendingUp size={12} className="text-primary" />
          <span className="font-mono text-[12px] font-bold tabular-nums text-primary">{overallConv}%</span>
          <span className="text-[11px] text-muted-foreground">conversion</span>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-6">
        {/* ── Desktop: Horizontal flow ── */}
        <div className="hidden md:block">
          <div className="flex items-center">
            {STAGES.map((stage, i) => {
              const count = funnel[stage.key];
              const Icon = stage.icon;
              const prevCount = i > 0 ? funnel[STAGES[i - 1].key] : 0;
              const rate = i > 0 ? convRate(prevCount, count) : null;
              const isEmpty = count === 0;
              const isHovered = hoveredStage === stage.key;

              return (
                <div key={stage.key} className="flex items-center flex-1 min-w-0">
                  {/* Connector */}
                  {i > 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center px-2 min-w-[40px]">
                      {rate && (
                        <span className="text-[10px] font-mono font-bold tabular-nums text-muted-foreground/50 mb-1">
                          {rate}
                        </span>
                      )}
                      <div className="w-full h-[2px] relative">
                        <div className="absolute inset-0 bg-border/20 rounded-full" />
                        {rate && (
                          <svg width="100%" height="2" className="absolute inset-0 overflow-visible">
                            <line
                              x1="0" y1="1" x2="100%" y2="1"
                              stroke={stage.iconColor}
                              strokeWidth="2"
                              strokeDasharray="3 5"
                              className="flow-dots"
                              opacity={0.5}
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stage node */}
                  <div
                    className="relative flex flex-col items-center gap-2 shrink-0 cursor-default"
                    onMouseEnter={() => setHoveredStage(stage.key)}
                    onMouseLeave={() => setHoveredStage(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-lg bg-popover border border-border px-3 py-1.5 text-[11px] text-foreground/80 shadow-xl milestone-in">
                        {stage.tooltip}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-border bg-popover" />
                      </div>
                    )}

                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 transition-all duration-300 ${
                        isEmpty
                          ? "bg-muted/10 ring-border/20"
                          : `${stage.bg} ${stage.ring}`
                      }`}
                      style={{
                        transform: isHovered ? "scale(1.08)" : undefined,
                        boxShadow: !isEmpty && count > 0
                          ? `0 0 ${Math.max(8, 20 * (count / maxCount))}px ${stage.iconColor}15`
                          : undefined,
                      }}
                    >
                      <Icon
                        size={20}
                        strokeWidth={1.5}
                        className={isEmpty ? "text-muted-foreground/20" : stage.color}
                      />
                    </div>
                    <span className={`font-mono text-xl font-bold tabular-nums leading-none ${
                      isEmpty ? "text-muted-foreground/25" : "text-foreground"
                    }`}>
                      {count.toLocaleString()}
                    </span>
                    <span className={`text-[10px] font-medium uppercase tracking-wider text-center leading-tight ${
                      isEmpty ? "text-muted-foreground/25" : "text-muted-foreground/60"
                    }`}>
                      {stage.shortLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Mobile: Vertical flow ── */}
        <div className="md:hidden space-y-1">
          {STAGES.map((stage, i) => {
            const count = funnel[stage.key];
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const Icon = stage.icon;
            const prevCount = i > 0 ? funnel[STAGES[i - 1].key] : 0;
            const rate = i > 0 ? convRate(prevCount, count) : null;
            const isEmpty = count === 0;
            return (
              <div key={stage.key}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-0.5 pl-3.5">
                    <div className="w-[1px] h-3 bg-border/20" />
                    {rate && (
                      <span className="text-[10px] font-mono font-bold tabular-nums text-muted-foreground/40">{rate}</span>
                    )}
                  </div>
                )}
                <div className={`flex items-center gap-3 ${isEmpty ? "opacity-30" : ""}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${stage.bg} ring-1 ${stage.ring}`}>
                    <Icon size={15} strokeWidth={1.5} className={stage.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-foreground">{stage.label}</span>
                      <span className="font-mono text-[14px] font-bold tabular-nums text-foreground">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${stage.barColor}`}
                        style={{ width: `${Math.max(pct, isEmpty ? 0 : 3)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export { BuyerJourney };
