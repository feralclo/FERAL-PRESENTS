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
  ChevronRight,
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
  glowColor: string;
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
    glowColor: "rgba(136, 136, 160, 0.15)",
    barColor: "bg-muted-foreground/25",
  },
  {
    key: "tickets",
    label: "Viewed Tickets",
    shortLabel: "Tickets",
    tooltip: "Scrolled to the ticket selection area",
    icon: Ticket,
    color: "text-info",
    iconColor: "#38BDF8",
    glowColor: "rgba(56, 189, 248, 0.12)",
    barColor: "bg-info/30",
  },
  {
    key: "add_to_cart",
    label: "Added to Cart",
    shortLabel: "Cart",
    tooltip: "Selected tickets or merch and added to cart",
    icon: ShoppingCart,
    color: "text-warning",
    iconColor: "#FBBF24",
    glowColor: "rgba(251, 191, 36, 0.12)",
    barColor: "bg-warning/30",
  },
  {
    key: "checkout",
    label: "Checkout",
    shortLabel: "Checkout",
    tooltip: "Entered the payment flow",
    icon: CreditCard,
    color: "text-primary",
    iconColor: "#8B5CF6",
    glowColor: "rgba(139, 92, 246, 0.15)",
    barColor: "bg-primary/25",
  },
  {
    key: "purchase",
    label: "Purchased",
    shortLabel: "Sold",
    tooltip: "Completed payment successfully",
    icon: CheckCircle2,
    color: "text-success",
    iconColor: "#34D399",
    glowColor: "rgba(52, 211, 153, 0.15)",
    barColor: "bg-success/30",
  },
];

function convRate(from: number, to: number): string {
  if (from <= 0 || to <= 0) return "";
  return `${((to / from) * 100).toFixed(0)}%`;
}

function BuyerJourney({ funnel }: BuyerJourneyProps) {
  const overallConv = funnel.landing > 0 ? ((funnel.purchase / funnel.landing) * 100).toFixed(1) : "0.0";
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const baseCount = Math.max(funnel.landing, 1);

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Buyer Journey
        </CardTitle>
        <div className="flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1.5">
          <TrendingUp size={12} className="text-primary" />
          <span className="font-mono text-[12px] font-bold tabular-nums text-primary">{overallConv}%</span>
          <span className="text-[11px] text-muted-foreground">conversion</span>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {/* ── Desktop: Horizontal flow ── */}
        <div className="hidden md:block">
          {/* Stage nodes */}
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-0">
            {STAGES.map((stage, i) => {
              const count = funnel[stage.key];
              const Icon = stage.icon;
              const prevCount = i > 0 ? funnel[STAGES[i - 1].key] : 0;
              const rate = i > 0 ? convRate(prevCount, count) : null;
              const isEmpty = count === 0;
              const isHovered = hoveredStage === stage.key;
              const fillPct = Math.max((count / baseCount) * 100, isEmpty ? 0 : 4);

              return (
                <>
                  {/* Connector between stages */}
                  {i > 0 && (
                    <div key={`conn-${stage.key}`} className="flex flex-col items-center justify-center px-1 min-w-[36px] self-start pt-[18px]">
                      <div className="relative flex items-center w-full">
                        <div className="flex-1 h-px bg-border/30" />
                        <ChevronRight size={12} strokeWidth={2} className="text-muted-foreground/30 mx-[-2px] shrink-0" />
                        <div className="flex-1 h-px bg-border/30" />
                      </div>
                      {rate ? (
                        <span className="mt-1.5 text-[10px] font-mono font-semibold tabular-nums text-muted-foreground/50 leading-none">
                          {rate}
                        </span>
                      ) : (
                        <span className="mt-1.5 text-[10px] font-mono text-muted-foreground/20 leading-none">—</span>
                      )}
                    </div>
                  )}

                  {/* Stage node */}
                  <div
                    key={stage.key}
                    className="relative flex flex-col items-center cursor-default"
                    onMouseEnter={() => setHoveredStage(stage.key)}
                    onMouseLeave={() => setHoveredStage(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-lg bg-popover border border-border px-3 py-1.5 text-[11px] text-foreground/80 shadow-xl milestone-in">
                        {stage.tooltip}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-border bg-popover" />
                      </div>
                    )}

                    {/* Icon */}
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
                        isEmpty ? "bg-muted/10" : ""
                      }`}
                      style={{
                        backgroundColor: isEmpty ? undefined : `${stage.iconColor}10`,
                        boxShadow: !isEmpty
                          ? `0 0 ${isHovered ? 20 : 12}px ${stage.glowColor}`
                          : undefined,
                        transform: isHovered ? "scale(1.08)" : undefined,
                        outline: `1px solid ${isEmpty ? "rgba(255,255,255,0.06)" : `${stage.iconColor}25`}`,
                      }}
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.5}
                        className={isEmpty ? "text-muted-foreground/20" : stage.color}
                      />
                    </div>

                    {/* Count */}
                    <span className={`mt-2.5 font-mono text-[22px] font-bold tabular-nums leading-none ${
                      isEmpty ? "text-muted-foreground/20" : "text-foreground"
                    }`}>
                      {isEmpty ? "—" : count.toLocaleString()}
                    </span>

                    {/* Label */}
                    <span className={`mt-1.5 text-[10px] font-medium uppercase tracking-wider text-center leading-tight ${
                      isEmpty ? "text-muted-foreground/20" : "text-muted-foreground/50"
                    }`}>
                      {stage.shortLabel}
                    </span>

                    {/* Proportional bar */}
                    <div className="mt-2.5 w-full h-[3px] rounded-full bg-secondary/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${isEmpty ? "" : stage.barColor}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                </>
              );
            })}
          </div>
        </div>

        {/* ── Mobile: Compact vertical flow ── */}
        <div className="md:hidden space-y-0.5">
          {STAGES.map((stage, i) => {
            const count = funnel[stage.key];
            const fillPct = Math.max((count / baseCount) * 100, count > 0 ? 4 : 0);
            const Icon = stage.icon;
            const prevCount = i > 0 ? funnel[STAGES[i - 1].key] : 0;
            const rate = i > 0 ? convRate(prevCount, count) : null;
            const isEmpty = count === 0;
            return (
              <div key={stage.key}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-1 pl-3.5">
                    <div className="w-px h-3 bg-border/20" />
                    {rate ? (
                      <span className="text-[10px] font-mono font-semibold tabular-nums text-muted-foreground/40">{rate}</span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground/15">—</span>
                    )}
                  </div>
                )}
                <div className={`flex items-center gap-3 py-1 ${isEmpty ? "opacity-30" : ""}`}>
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1"
                    style={{
                      backgroundColor: isEmpty ? undefined : `${stage.iconColor}10`,
                      outline: `1px solid ${isEmpty ? "transparent" : `${stage.iconColor}20`}`,
                    }}
                  >
                    <Icon size={15} strokeWidth={1.5} className={stage.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-foreground/80">{stage.label}</span>
                      <span className="font-mono text-[15px] font-bold tabular-nums text-foreground">
                        {isEmpty ? "—" : count.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-[3px] w-full overflow-hidden rounded-full bg-secondary/60">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${stage.barColor}`}
                        style={{ width: `${fillPct}%` }}
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
