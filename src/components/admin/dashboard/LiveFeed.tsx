"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { SaleConfetti } from "./SaleConfetti";
import {
  ShoppingBag,
  ShoppingCart,
  CheckCircle2,
  CreditCard,
  Flame,
} from "lucide-react";
import type { ActivityItem } from "./ActivityFeed";

const TX_CONFIG = {
  order: { icon: ShoppingBag, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", border: "border-l-success", amount: "bg-success/15 text-success" },
  purchase: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", border: "border-l-success", amount: "bg-success/15 text-success" },
  checkout: { icon: CreditCard, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20", border: "border-l-primary", amount: "" },
  add_to_cart: { icon: ShoppingCart, color: "text-warning", bg: "bg-warning/10", ring: "ring-warning/20", border: "border-l-warning", amount: "bg-warning/15 text-warning" },
} as const;

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

interface LiveFeedProps {
  items: ActivityItem[];
  saleStreak: number;
}

function LiveFeed({ items, saleStreak }: LiveFeedProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Filter out page views — those are in BuyerJourney
  const transactions = useMemo(
    () => items.filter((item) => item.type !== "page_view").slice(0, 15),
    [items]
  );

  return (
    <Card className="py-0 gap-0 flex flex-col h-full">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Live Feed
          </CardTitle>
          {saleStreak >= 3 && (
            <span className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive milestone-in">
              <Flame size={12} /> {saleStreak}-sale streak
            </span>
          )}
        </div>
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
  const showConfetti = isRevenue && age < 2_000;

  return (
    <div
      className={`group relative flex items-start gap-3 rounded-lg border-l-2 transition-all duration-300 hover:bg-secondary/60
        ${config.border} pl-2.5 pr-2 py-2.5
        ${isRevenue && isFresh ? "bg-success/[0.04]" : ""}`}
      style={{
        animation: isFresh ? "activity-slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
      }}
    >
      {showConfetti && <SaleConfetti />}
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
              <span className="text-border">&middot;</span>
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

export { LiveFeed };
