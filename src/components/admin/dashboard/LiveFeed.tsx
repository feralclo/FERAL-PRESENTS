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
  Zap,
} from "lucide-react";
import type { ActivityItem } from "./ActivityFeed";

const TX_CONFIG = {
  order: { icon: ShoppingBag, color: "text-success", iconColor: "#34D399", bg: "bg-success/10", ring: "ring-success/20", border: "border-l-success", amount: "bg-success/15 text-success", label: "New Order" },
  purchase: { icon: CheckCircle2, color: "text-success", iconColor: "#34D399", bg: "bg-success/10", ring: "ring-success/20", border: "border-l-success", amount: "bg-success/15 text-success", label: "Purchase" },
  checkout: { icon: CreditCard, color: "text-primary", iconColor: "#8B5CF6", bg: "bg-primary/10", ring: "ring-primary/20", border: "border-l-primary", amount: "", label: "Checkout" },
  add_to_cart: { icon: ShoppingCart, color: "text-warning", iconColor: "#FBBF24", bg: "bg-warning/10", ring: "ring-warning/20", border: "border-l-warning", amount: "bg-warning/15 text-warning", label: "Added to Cart" },
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

  const transactions = useMemo(
    () => items.filter((item) => item.type !== "page_view").slice(0, 20),
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
            <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-destructive/15 to-warning/15 px-3 py-1 text-[12px] font-bold text-destructive milestone-in">
              <Flame size={13} className="text-destructive" />
              {saleStreak}-sale streak!
              <Zap size={11} className="text-warning" />
            </span>
          )}
        </div>
        <LiveIndicator color="success" size="sm" label="Live" />
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-0 pb-0">
        <div className="h-full max-h-[420px] overflow-y-auto px-5 pb-5">
          {transactions.length === 0 ? (
            <div className="flex h-36 flex-col items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/20 ring-1 ring-border/30">
                <ShoppingBag size={20} className="text-muted-foreground/30" />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-muted-foreground/60">Waiting for action...</p>
                <p className="mt-1 text-[11px] text-muted-foreground/40">
                  Sales, carts &amp; checkouts appear here live
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
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
  const showConfetti = isRevenue && age < 2_500;

  // Revenue items get hero treatment
  if (isRevenue && item.amount) {
    return (
      <div
        className={`group relative overflow-hidden rounded-xl border transition-all duration-500
          ${isFresh
            ? "border-success/30 bg-gradient-to-r from-success/[0.06] to-transparent shadow-[0_0_20px_rgba(52,211,153,0.08)]"
            : "border-border/30 bg-secondary/20"
          }`}
        style={{
          animation: isFresh ? "activity-slide-in 500ms cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
        }}
      >
        {showConfetti && <SaleConfetti />}
        <div className="flex items-center gap-4 p-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-success/25"
            style={{
              backgroundColor: "rgba(52, 211, 153, 0.12)",
              boxShadow: isFresh ? "0 0 12px rgba(52, 211, 153, 0.2)" : undefined,
            }}
          >
            <Icon size={18} strokeWidth={1.5} className="text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground">{item.title}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
              {item.eventName && (
                <>
                  <span className="truncate">{item.eventName}</span>
                  <span className="text-border/60">&middot;</span>
                </>
              )}
              <span className={`shrink-0 tabular-nums ${isFresh ? "text-success/80 font-semibold" : ""}`}>
                {relativeTime(item.timestamp)}
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-xl bg-success/15 px-3.5 py-1.5 font-mono text-[14px] font-bold tabular-nums text-success">
            {item.amount}
          </span>
          {isFresh && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
          )}
        </div>
      </div>
    );
  }

  // Standard transaction item
  return (
    <div
      className={`group relative flex items-start gap-3 rounded-lg border-l-2 transition-all duration-300 hover:bg-secondary/60
        ${config.border} pl-3 pr-2 py-3`}
      style={{
        animation: isFresh ? "activity-slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
      }}
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg} ring-1 ${config.ring}`}>
        <Icon size={15} strokeWidth={1.5} className={config.color} />
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
              <span className="text-border/60">&middot;</span>
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
