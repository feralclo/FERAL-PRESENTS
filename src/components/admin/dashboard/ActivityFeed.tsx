"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import {
  ShoppingBag,
  ShoppingCart,
  Eye,
  CheckCircle2,
  CreditCard,
  Ticket,
  Users,
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

/* ── Event type visual config ── */

const EVENT_CONFIG = {
  order: {
    icon: ShoppingBag,
    color: "text-success",
    bg: "bg-success/10",
    border: "border-l-success",
    ring: "ring-success/20",
    amountStyle: "bg-success/15 text-success",
  },
  purchase: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10",
    border: "border-l-success",
    ring: "ring-success/20",
    amountStyle: "bg-success/15 text-success",
  },
  checkout: {
    icon: CreditCard,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-l-primary",
    ring: "ring-primary/20",
    amountStyle: "",
  },
  add_to_cart: {
    icon: ShoppingCart,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-l-warning",
    ring: "ring-warning/20",
    amountStyle: "bg-warning/15 text-warning",
  },
  page_view: {
    icon: Eye,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "",
    ring: "ring-border/30",
    amountStyle: "",
  },
  ticket: {
    icon: Ticket,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-l-primary",
    ring: "ring-primary/20",
    amountStyle: "",
  },
} as const;

/* ── Grouped display types ── */

type DisplayItem =
  | { kind: "single"; item: ActivityItem; key: string }
  | { kind: "group"; eventName: string; count: number; latestTimestamp: Date; key: string };

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

/** Group page_view items by event name, keep all other types as singles */
function groupItems(items: ActivityItem[]): DisplayItem[] {
  const singles: DisplayItem[] = [];
  const pageViewGroups = new Map<string, { count: number; latestTimestamp: Date }>();

  for (const item of items) {
    if (item.type === "page_view") {
      const key = item.eventName || "__unknown__";
      const existing = pageViewGroups.get(key);
      if (existing) {
        existing.count++;
        if (item.timestamp > existing.latestTimestamp) {
          existing.latestTimestamp = item.timestamp;
        }
      } else {
        pageViewGroups.set(key, { count: 1, latestTimestamp: item.timestamp });
      }
    } else {
      singles.push({ kind: "single", item, key: item.id });
    }
  }

  const groups: DisplayItem[] = [];
  for (const [eventName, { count, latestTimestamp }] of pageViewGroups) {
    groups.push({ kind: "group", eventName, count, latestTimestamp, key: `group-${eventName}` });
  }

  // Merge and sort newest first
  const all = [...singles, ...groups];
  all.sort((a, b) => {
    const tsA = a.kind === "single" ? a.item.timestamp.getTime() : a.latestTimestamp.getTime();
    const tsB = b.kind === "single" ? b.item.timestamp.getTime() : b.latestTimestamp.getTime();
    return tsB - tsA;
  });

  return all;
}

function getActivityCounts(items: ActivityItem[]) {
  const counts = { views: 0, carts: 0, checkouts: 0, sales: 0 };
  for (const item of items) {
    switch (item.type) {
      case "page_view": counts.views++; break;
      case "add_to_cart": counts.carts++; break;
      case "checkout": counts.checkouts++; break;
      case "purchase": case "order": counts.sales++; break;
    }
  }
  return counts;
}

/* ── Components ── */

function SummaryBadge({
  icon: Icon,
  count,
  color,
  label,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count: number;
  color: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <Icon size={12} className={color} />
      <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground/70">
        {count}
      </span>
    </span>
  );
}

function SingleItem({ item }: { item: ActivityItem }) {
  const config = EVENT_CONFIG[item.type] || EVENT_CONFIG.page_view;
  const Icon = config.icon;
  const age = Date.now() - item.timestamp.getTime();
  const isFresh = age < 30_000;
  const isRevenue = item.type === "order" || item.type === "purchase";
  const hasBorder = !!config.border;

  return (
    <div
      className={`group flex items-start gap-3 rounded-lg transition-all duration-300 hover:bg-secondary/60
        ${hasBorder ? `border-l-2 ${config.border} pl-2.5 pr-2 py-2.5` : "px-2 py-2.5"}
        ${isRevenue && isFresh ? "bg-success/[0.04]" : ""}`}
      style={{
        animation: isFresh ? "activity-slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
      }}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.bg} ring-1 ${config.ring}`}
      >
        <Icon size={14} strokeWidth={1.5} className={config.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-medium text-foreground">
            {item.title}
          </p>
          {item.amount && (
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${config.amountStyle || "bg-muted/30 text-foreground/70"}`}
            >
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

function GroupedPageViews({
  eventName,
  count,
  latestTimestamp,
}: {
  eventName: string;
  count: number;
  latestTimestamp: Date;
}) {
  const age = Date.now() - latestTimestamp.getTime();
  const isFresh = age < 30_000;

  return (
    <div
      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-300 hover:bg-secondary/60"
      style={{
        animation: isFresh ? "activity-slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
      }}
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-border/30">
        <Users size={14} strokeWidth={1.5} className="text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-muted/50 px-1.5 font-mono text-[10px] font-bold tabular-nums text-foreground/70">
            {count}
          </span>
          <p className="truncate text-[13px] text-muted-foreground">
            {count === 1 ? "visitor viewing" : "visitors viewing"}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
          {eventName !== "__unknown__" && (
            <>
              <span className="truncate">{eventName}</span>
              <span className="text-border">·</span>
            </>
          )}
          <span className={`shrink-0 tabular-nums ${isFresh ? "text-success/80" : ""}`}>
            {relativeTime(latestTimestamp)}
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

/* ── Main Component ── */

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

  const slicedItems = items.slice(0, maxItems);
  const displayItems = useMemo(() => groupItems(slicedItems), [slicedItems]);
  const counts = useMemo(() => getActivityCounts(slicedItems), [slicedItems]);
  const hasActivity = displayItems.length > 0;
  const hasAnyCounts = counts.views + counts.carts + counts.checkouts + counts.sales > 0;

  return (
    <Card className="py-0 gap-0 flex flex-col h-full">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Live Activity
        </CardTitle>
        <LiveIndicator color="success" size="sm" label="Live" />
      </CardHeader>

      {/* Summary strip */}
      {hasAnyCounts && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-4 rounded-lg bg-secondary/40 px-3 py-2">
            {counts.views > 0 && (
              <SummaryBadge icon={Eye} count={counts.views} color="text-muted-foreground" label="Page views" />
            )}
            {counts.carts > 0 && (
              <SummaryBadge icon={ShoppingCart} count={counts.carts} color="text-warning" label="Add to carts" />
            )}
            {counts.checkouts > 0 && (
              <SummaryBadge icon={CreditCard} count={counts.checkouts} color="text-primary" label="Checkouts" />
            )}
            {counts.sales > 0 && (
              <SummaryBadge icon={CheckCircle2} count={counts.sales} color="text-success" label="Sales" />
            )}
          </div>
        </div>
      )}

      <CardContent className="flex-1 overflow-hidden px-0 pb-0">
        <div
          ref={containerRef}
          className="h-full max-h-[420px] overflow-y-auto px-5 pb-5"
        >
          {!hasActivity ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20 ring-1 ring-border/30">
                <Eye size={18} className="text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground/60">
                  Waiting for activity...
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/40">
                  Events appear here in real time
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {displayItems.map((displayItem) =>
                displayItem.kind === "single" ? (
                  <SingleItem key={displayItem.key} item={displayItem.item} />
                ) : (
                  <GroupedPageViews
                    key={displayItem.key}
                    eventName={displayItem.eventName}
                    count={displayItem.count}
                    latestTimestamp={displayItem.latestTimestamp}
                  />
                )
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { ActivityFeed };
