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
    tooltip: "Unique visitors who landed on an event page",
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
    tooltip: "Scrolled down and viewed the ticket selection section",
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
    tooltip: "Completed payment and received tickets",
    icon: CheckCircle2,
    color: "text-success",
    iconColor: "#34D399",
    bg: "bg-success/10",
    ring: "ring-success/20",
    barColor: "bg-success/50",
  },
];

function convRate(from: number, to: number): string {
  if (from <= 0) return "\u2014";
  return `${((to / from) * 100).toFixed(0)}%`;
}

function BuyerJourney({ funnel }: BuyerJourneyProps) {
  const overallConv = funnel.landing > 0 ? ((funnel.purchase / funnel.landing) * 100).toFixed(1) : "0.0";
  const maxCount = Math.max(...STAGES.map((s) => funnel[s.key]), 1);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Buyer Journey
        </CardTitle>
        <div className="flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1.5">
          <TrendingUp size={13} className="text-primary" />
          <span className="font-mono text-[12px] font-bold tabular-nums text-primary">{overallConv}%</span>
          <span className="text-[11px] text-muted-foreground">overall conversion</span>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-6">
        {/* ── Desktop: Horizontal flow with proportional connectors ── */}
        <div className="hidden md:block">
          <div className="relative flex items-center justify-between">
            {STAGES.map((stage, i) => {
              const count = funnel[stage.key];
              const Icon = stage.icon;
              const rate = i > 0 ? convRate(funnel[STAGES[i - 1].key], count) : null;
              const intensity = maxCount > 0 ? Math.max(0.2, count / maxCount) : 0.2;
              const isHovered = hoveredStage === stage.key;
              const rateNum = i > 0 && funnel[STAGES[i - 1].key] > 0
                ? (count / funnel[STAGES[i - 1].key])
                : 0;

              return (
                <div key={stage.key} className="flex items-center flex-1 min-w-0">
                  {/* Connector line — thickness proportional to conversion */}
                  {i > 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center px-1.5 min-w-[44px]">
                      <span className="text-[10px] font-mono font-bold tabular-nums text-muted-foreground/60 mb-1.5">
                        {rate}
                      </span>
                      <svg width="100%" height="12" className="overflow-visible">
                        {/* Track line */}
                        <line
                          x1="0" y1="6" x2="100%" y2="6"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-border/20"
                        />
                        {/* Flowing dots line */}
                        <line
                          x1="0" y1="6" x2="100%" y2="6"
                          stroke={STAGES[i].iconColor}
                          strokeWidth={Math.max(1.5, rateNum * 3)}
                          strokeDasharray="3 5"
                          className="flow-dots"
                          opacity={Math.max(0.3, rateNum)}
                        />
                      </svg>
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
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-lg bg-card border border-border/60 px-3 py-1.5 text-[11px] text-foreground/80 shadow-xl milestone-in">
                        {stage.tooltip}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-border/60 bg-card" />
                      </div>
                    )}

                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stage.bg} ring-1 ${stage.ring} transition-all duration-500`}
                      style={{
                        boxShadow: count > 0
                          ? `0 0 ${16 * intensity}px ${stage.iconColor}${Math.round(intensity * 50).toString(16).padStart(2, "0")}, 0 0 ${32 * intensity}px ${stage.iconColor}${Math.round(intensity * 20).toString(16).padStart(2, "0")}`
                          : undefined,
                        transform: isHovered ? "scale(1.1)" : undefined,
                      }}
                    >
                      <Icon size={22} strokeWidth={1.5} className={stage.color} />
                    </div>
                    <span className="font-mono text-2xl font-bold tabular-nums text-foreground leading-none">
                      {count.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 text-center leading-tight">
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
            const rate = i > 0 ? convRate(funnel[STAGES[i - 1].key], count) : null;
            return (
              <div key={stage.key}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-0.5 pl-3.5">
                    <div className="w-[1px] h-3 bg-border/30" />
                    <span className="text-[10px] font-mono font-bold tabular-nums text-muted-foreground/40">{rate}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
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
                        style={{ width: `${Math.max(pct, 3)}%` }}
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
