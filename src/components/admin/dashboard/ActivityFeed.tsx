"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import {
  ShoppingBag,
  ShoppingCart,
  Eye,
  CheckCircle2,
  CreditCard,
  Ticket,
} from "lucide-react";

export interface ActivityItem {
  id: string;
  type: "order" | "add_to_cart" | "page_view" | "purchase" | "checkout" | "ticket";
  title: string;
  detail?: string;
  amount?: string;
  timestamp: Date;
  eventName?: string;
}

const ICON_MAP = {
  order: { icon: ShoppingBag, color: "text-success" },
  add_to_cart: { icon: ShoppingCart, color: "text-warning" },
  page_view: { icon: Eye, color: "text-muted-foreground" },
  purchase: { icon: CheckCircle2, color: "text-success" },
  checkout: { icon: CreditCard, color: "text-primary" },
  ticket: { icon: Ticket, color: "text-primary" },
} as const;

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const seconds = Math.floor(diff / 1000);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function ActivityFeed({
  items,
  maxItems = 20,
}: {
  items: ActivityItem[];
  maxItems?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Refresh relative times every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const displayItems = items.slice(0, maxItems);

  return (
    <Card className="py-0 gap-0 flex flex-col h-full">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Live Activity
        </CardTitle>
        <LiveIndicator color="success" size="sm" label="Live" />
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-0 pb-0">
        <div
          ref={containerRef}
          className="h-full max-h-[420px] overflow-y-auto px-5 pb-5"
        >
          {displayItems.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Waiting for activity...
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayItems.map((item) => {
                const config = ICON_MAP[item.type] || ICON_MAP.page_view;
                const Icon = config.icon;
                const age = Date.now() - item.timestamp.getTime();
                const isFresh = age < 30_000; // 30 seconds

                return (
                  <div
                    key={item.id}
                    className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-all duration-300 hover:bg-secondary/60"
                    style={{
                      animation: isFresh ? "activity-slide-in 300ms ease-out" : undefined,
                    }}
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary ring-1 ring-border/50`}
                    >
                      <Icon size={14} strokeWidth={1.5} className={config.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {item.title}
                        </p>
                        {item.amount && (
                          <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-success">
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
                        <span className="shrink-0 tabular-nums">{relativeTime(item.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { ActivityFeed };
