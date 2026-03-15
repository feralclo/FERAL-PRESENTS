"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  Search,
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
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  color: string;
  iconColor: string;
  bg: string;
  ring: string;
  barColor: string;
}[] = [
  { key: "landing", label: "Landing", shortLabel: "Landing", icon: Eye, color: "text-muted-foreground", iconColor: "#8888a0", bg: "bg-muted/30", ring: "ring-border/40", barColor: "bg-muted-foreground/30" },
  { key: "tickets", label: "Browsing", shortLabel: "Browse", icon: Search, color: "text-info", iconColor: "#38BDF8", bg: "bg-info/8", ring: "ring-info/15", barColor: "bg-info/40" },
  { key: "add_to_cart", label: "Added to Cart", shortLabel: "Cart", icon: ShoppingCart, color: "text-warning", iconColor: "#FBBF24", bg: "bg-warning/8", ring: "ring-warning/15", barColor: "bg-warning/40" },
  { key: "checkout", label: "Checkout", shortLabel: "Checkout", icon: CreditCard, color: "text-primary", iconColor: "#8B5CF6", bg: "bg-primary/8", ring: "ring-primary/15", barColor: "bg-primary/40" },
  { key: "purchase", label: "Purchased", shortLabel: "Sold", icon: CheckCircle2, color: "text-success", iconColor: "#34D399", bg: "bg-success/10", ring: "ring-success/20", barColor: "bg-success/50" },
];

function convRate(from: number, to: number): string {
  if (from <= 0) return "\u2014";
  return `${((to / from) * 100).toFixed(0)}%`;
}

function BuyerJourney({ funnel }: BuyerJourneyProps) {
  const overallConv = funnel.landing > 0 ? ((funnel.purchase / funnel.landing) * 100).toFixed(1) : "0.0";
  const maxCount = Math.max(...STAGES.map((s) => funnel[s.key]), 1);

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Buyer Journey
        </CardTitle>
        <div className="flex items-center gap-2 rounded-md bg-secondary/60 px-2.5 py-1">
          <TrendingUp size={12} className="text-primary" />
          <span className="font-mono text-[11px] font-bold tabular-nums text-primary">{overallConv}%</span>
          <span className="text-[10px] text-muted-foreground">overall</span>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {/* ── Desktop: Horizontal flow with animated SVG connectors ── */}
        <div className="hidden md:block">
          <div className="relative flex items-center justify-between">
            {STAGES.map((stage, i) => {
              const count = funnel[stage.key];
              const Icon = stage.icon;
              const rate = i > 0 ? convRate(funnel[STAGES[i - 1].key], count) : null;
              // Glow intensity based on count proportion
              const intensity = maxCount > 0 ? Math.max(0.15, count / maxCount) : 0.15;

              return (
                <div key={stage.key} className="flex items-center flex-1 min-w-0">
                  {/* Animated connector */}
                  {i > 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center px-1 min-w-[40px]">
                      <span className="text-[10px] font-mono font-semibold tabular-nums text-muted-foreground/50 mb-1">
                        {rate}
                      </span>
                      <svg width="100%" height="8" className="overflow-visible">
                        <line
                          x1="0" y1="4" x2="100%" y2="4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                          className="text-border/40 flow-dots"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Stage node */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${stage.bg} ring-1 ${stage.ring} transition-shadow duration-500`}
                      style={{
                        boxShadow: count > 0 ? `0 0 ${12 * intensity}px ${stage.iconColor}${Math.round(intensity * 40).toString(16).padStart(2, "0")}` : undefined,
                      }}
                    >
                      <Icon size={20} strokeWidth={1.5} className={stage.color} />
                    </div>
                    <span className="font-mono text-xl font-bold tabular-nums text-foreground leading-none">
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

        {/* ── Mobile: Vertical bars ── */}
        <div className="md:hidden space-y-2.5">
          {STAGES.map((stage, i) => {
            const count = funnel[stage.key];
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const Icon = stage.icon;
            const rate = i > 0 ? convRate(funnel[STAGES[i - 1].key], count) : null;
            return (
              <div key={stage.key}>
                {i > 0 && (
                  <div className="flex items-center justify-center py-0.5">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40">{"\u2193"} {rate}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${stage.bg} ring-1 ${stage.ring}`}>
                    <Icon size={14} strokeWidth={1.5} className={stage.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-foreground">{stage.label}</span>
                      <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${stage.barColor}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
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
