"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import {
  ShoppingBag,
  ShoppingCart,
  Eye,
  CheckCircle2,
  CreditCard,
  Ticket,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import type { ActivityItem } from "./ActivityFeed";
import type { TopEventRow } from "./TopEventsTable";

/* ── Types ── */

interface FunnelStats {
  landing: number;
  tickets: number;
  add_to_cart: number;
  checkout: number;
  purchase: number;
}

interface LivePulseProps {
  funnel: FunnelStats;
  topEvents: TopEventRow[];
  activityFeed: ActivityItem[];
  currencySymbol?: string;
}

/* ── Pipeline Config ── */

const STAGES: {
  key: keyof FunnelStats;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  color: string;
  bg: string;
  ring: string;
  barColor: string;
}[] = [
  { key: "landing", label: "Landing", shortLabel: "Land", icon: Eye, color: "text-muted-foreground", bg: "bg-muted/30", ring: "ring-border/40", barColor: "bg-muted-foreground/30" },
  { key: "tickets", label: "Viewed Tickets", shortLabel: "Tickets", icon: Ticket, color: "text-info", bg: "bg-info/8", ring: "ring-info/15", barColor: "bg-info/40" },
  { key: "add_to_cart", label: "Added to Cart", shortLabel: "Cart", icon: ShoppingCart, color: "text-warning", bg: "bg-warning/8", ring: "ring-warning/15", barColor: "bg-warning/40" },
  { key: "checkout", label: "Checkout", shortLabel: "Checkout", icon: CreditCard, color: "text-primary", bg: "bg-primary/8", ring: "ring-primary/15", barColor: "bg-primary/40" },
  { key: "purchase", label: "Purchased", shortLabel: "Sold", icon: CheckCircle2, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", barColor: "bg-success/50" },
];

/* ── Transaction Feed Config ── */

const TX_CONFIG = {
  order: { icon: ShoppingBag, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", border: "border-l-success", amount: "bg-success/15 text-success" },
  purchase: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", border: "border-l-success", amount: "bg-success/15 text-success" },
  checkout: { icon: CreditCard, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20", border: "border-l-primary", amount: "" },
  add_to_cart: { icon: ShoppingCart, color: "text-warning", bg: "bg-warning/10", ring: "ring-warning/20", border: "border-l-warning", amount: "bg-warning/15 text-warning" },
  ticket: { icon: Ticket, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20", border: "border-l-primary", amount: "" },
} as const;

/* ── Helpers ── */

function relativeTime(date: Date): string {
  const diff = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function convRate(from: number, to: number): string {
  if (from <= 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

/* ══════════════════════════════════════════
   SECTION 1: CONVERSION PIPELINE
   ══════════════════════════════════════════ */

function ConversionPipeline({ funnel }: { funnel: FunnelStats }) {
  const maxCount = Math.max(...STAGES.map((s) => funnel[s.key]), 1);
  const overallConv = funnel.landing > 0 ? ((funnel.purchase / funnel.landing) * 100).toFixed(1) : "0.0";

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Conversion Pipeline
        </CardTitle>
        <div className="flex items-center gap-2 rounded-md bg-secondary/60 px-2.5 py-1">
          <TrendingUp size={12} className="text-primary" />
          <span className="font-mono text-[11px] font-bold tabular-nums text-primary">{overallConv}%</span>
          <span className="text-[10px] text-muted-foreground">overall</span>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {/* ── Desktop: Horizontal flow ── */}
        <div className="hidden md:flex items-center gap-0">
          {STAGES.map((stage, i) => {
            const count = funnel[stage.key];
            const Icon = stage.icon;
            const rate = i > 0 ? convRate(funnel[STAGES[i - 1].key], count) : null;
            return (
              <div key={stage.key} className="flex items-center flex-1 min-w-0">
                {/* Connector */}
                {i > 0 && (
                  <div className="flex flex-col items-center justify-center px-1 shrink-0">
                    <span className="text-[10px] font-mono font-semibold tabular-nums text-muted-foreground/50 mb-0.5">
                      {rate}
                    </span>
                    <ChevronRight size={14} className="text-muted-foreground/25" />
                  </div>
                )}

                {/* Stage node */}
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stage.bg} ring-1 ${stage.ring}`}>
                    <Icon size={18} strokeWidth={1.5} className={stage.color} />
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
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40">↓ {rate}</span>
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

/* ══════════════════════════════════════════
   SECTION 2: EVENT SPOTLIGHT
   ══════════════════════════════════════════ */

function EventSpotlight({
  events,
  currencySymbol,
}: {
  events: TopEventRow[];
  currencySymbol: string;
}) {
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
              return (
                <div
                  key={ev.eventSlug}
                  className={`rounded-lg border p-3 transition-colors
                    ${isTopEvent
                      ? "border-primary/20 bg-primary/[0.03]"
                      : "border-border/40 bg-secondary/20"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[13px] font-semibold text-foreground truncate">
                      {ev.eventName}
                    </span>
                    {ev.revenue > 0 && (
                      <span className="shrink-0 rounded-md bg-success/12 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-success">
                        {currencySymbol}{ev.revenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye size={12} className="text-muted-foreground/60" />
                      <span className="font-mono tabular-nums font-semibold text-foreground/70">{ev.views.toLocaleString()}</span>
                      <span className="text-muted-foreground/50">views</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ShoppingBag size={12} className="text-success/60" />
                      <span className="font-mono tabular-nums font-semibold text-foreground/70">{ev.sales.toLocaleString()}</span>
                      <span className="text-muted-foreground/50">orders</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <TrendingUp size={12} className="text-primary/60" />
                      <span className="font-mono tabular-nums font-semibold text-foreground/70">{conv}%</span>
                      <span className="text-muted-foreground/50">conv</span>
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

/* ══════════════════════════════════════════
   SECTION 3: LIVE TRANSACTIONS FEED
   ══════════════════════════════════════════ */

function TransactionFeed({ items }: { items: ActivityItem[] }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Only show transactions (no page views — those are in the pipeline)
  const transactions = useMemo(
    () => items.filter((item) => item.type !== "page_view").slice(0, 15),
    [items]
  );

  return (
    <Card className="py-0 gap-0 flex flex-col h-full">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Live Transactions
        </CardTitle>
        <LiveIndicator color="success" size="sm" label="Live" />
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-0 pb-0">
        <div className="h-full max-h-[380px] overflow-y-auto px-5 pb-5">
          {transactions.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20 ring-1 ring-border/30">
                <ShoppingBag size={18} className="text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground/60">No transactions yet</p>
                <p className="mt-1 text-[11px] text-muted-foreground/40">
                  Cart, checkout &amp; purchase events appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {transactions.map((item) => (
                <TransactionItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionItem({ item }: { item: ActivityItem }) {
  const config = TX_CONFIG[item.type as keyof typeof TX_CONFIG] || TX_CONFIG.add_to_cart;
  const Icon = config.icon;
  const age = Date.now() - item.timestamp.getTime();
  const isFresh = age < 30_000;
  const isRevenue = item.type === "order" || item.type === "purchase";

  return (
    <div
      className={`group flex items-start gap-3 rounded-lg border-l-2 transition-all duration-300 hover:bg-secondary/60
        ${config.border} pl-2.5 pr-2 py-2.5
        ${isRevenue && isFresh ? "bg-success/[0.04]" : ""}`}
      style={{
        animation: isFresh ? "activity-slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
      }}
    >
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.bg} ring-1 ${config.ring}`}>
        <Icon size={14} strokeWidth={1.5} className={config.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-medium text-foreground">{item.title}</p>
          {item.amount && (
            <span className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${config.amount || "bg-muted/30 text-foreground/70"}`}>
              {item.amount}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {item.eventName && (
            <>
              <span className="truncate">{item.eventName}</span>
              <span className="text-border">·</span>
            </>
          )}
          <span className={`shrink-0 tabular-nums ${isFresh ? "text-success/80" : ""}`}>
            {relativeTime(item.timestamp)}
          </span>
          {isFresh && (
            <span className="relative ml-0.5 inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN: LIVE PULSE
   ══════════════════════════════════════════ */

function LivePulse({
  funnel,
  topEvents,
  activityFeed,
  currencySymbol = "£",
}: LivePulseProps) {
  return (
    <div className="space-y-6">
      {/* Full-width conversion pipeline */}
      <ConversionPipeline funnel={funnel} />

      {/* Two columns: events + transactions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EventSpotlight events={topEvents} currencySymbol={currencySymbol} />
        <TransactionFeed items={activityFeed} />
      </div>
    </div>
  );
}

export { LivePulse };
export type { LivePulseProps };
