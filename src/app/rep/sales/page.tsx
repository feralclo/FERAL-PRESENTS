"use client";

import { useEffect, useState, useMemo } from "react";
import {
  TrendingUp,
  ShoppingBag,
  Banknote,
  BarChart3,
  Filter,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RadialGauge, EmptyState, HudSectionHeader } from "@/components/rep";

interface Sale {
  id: string;
  order_number: string;
  total: number;
  subtotal: number;
  fees: number;
  status: string;
  currency: string;
  created_at: string;
  event?: { id: string; name: string; slug: string };
}

function getCurrencySymbol(currency?: string): string {
  switch (currency?.toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "\u20AC";
    case "GBP": return "\u00A3";
    default: return "\u00A3";
  }
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function groupSalesByDate(sales: Sale[]): { label: string; sales: Sale[] }[] {
  const groups: Map<string, Sale[]> = new Map();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const sale of sales) {
    const d = new Date(sale.created_at);
    let label: string;

    if (d.toDateString() === today.toDateString()) {
      label = "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    }

    const existing = groups.get(label);
    if (existing) existing.push(sale);
    else groups.set(label, [sale]);
  }

  return Array.from(groups.entries()).map(([label, sales]) => ({ label, sales }));
}

export default function RepSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rep-portal/sales?limit=200");
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error || "Failed to load sales (" + res.status + ")");
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) setSales(json.data);
      } catch { setError("Failed to load sales — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const events = useMemo(() => {
    const map = new Map<string, string>();
    for (const sale of sales) {
      if (sale.event?.id) map.set(sale.event.id, sale.event.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sales]);

  const filteredSales = useMemo(() => {
    if (filterEvent === "all") return sales;
    return sales.filter((s) => s.event?.id === filterEvent);
  }, [sales, filterEvent]);

  const stats = useMemo(() => {
    const s = filteredSales;
    const totalRevenue = s.reduce((sum, sale) => sum + Number(sale.total), 0);
    const avgOrder = s.length > 0 ? totalRevenue / s.length : 0;
    return { count: s.length, revenue: totalRevenue, avgOrder };
  }, [filteredSales]);

  const groups = useMemo(() => groupSalesByDate(filteredSales), [filteredSales]);
  const currSymbol = getCurrencySymbol(sales[0]?.currency);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <div>
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <TrendingUp size={22} className="text-destructive" />
          </div>
          <p className="text-sm text-foreground font-medium mb-1">Failed to load sales</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          >
            <RefreshCw size={12} />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between rep-slide-up">
        <div>
          <h1 className="text-xl font-bold rep-gradient-text">Sales</h1>
          <p className="text-sm text-muted-foreground">
            Orders placed with your discount code
          </p>
        </div>
        {events.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "border-primary/50 text-primary")}
          >
            <Filter size={12} />
            Filter
          </Button>
        )}
      </div>

      {/* Event filter */}
      {showFilters && events.length > 1 && (
        <div className="flex flex-wrap gap-2 rep-slide-up">
          <button
            onClick={() => setFilterEvent("all")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium border transition-all",
              filterEvent === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            )}
          >
            All Events
          </button>
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => setFilterEvent(event.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-medium border transition-all",
                filterEvent === event.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              {event.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats — Radial HUD Gauges */}
      <div className="grid grid-cols-3 gap-3 rep-slide-up" style={{ animationDelay: "50ms" }}>
        <RadialGauge
          value={stats.count}
          max={Math.max(stats.count, 20)}
          color="#8B5CF6"
          icon={ShoppingBag}
          label="Sales"
          displayValue={String(stats.count)}
        />
        <RadialGauge
          value={stats.revenue}
          max={Math.max(stats.revenue, 500)}
          color="#34D399"
          icon={Banknote}
          label="Earned"
          displayValue={`${currSymbol}${stats.revenue.toFixed(0)}`}
        />
        <RadialGauge
          value={stats.avgOrder}
          max={Math.max(stats.avgOrder, 100)}
          color="#38BDF8"
          icon={BarChart3}
          label="Avg"
          displayValue={`${currSymbol}${stats.avgOrder.toFixed(0)}`}
        />
      </div>

      {/* Sales Timeline */}
      {filteredSales.length === 0 ? (
        <div className="rep-slide-up">
          <EmptyState
            icon={TrendingUp}
            title={filterEvent !== "all" ? "No sales for this event" : "No sales yet"}
            subtitle={filterEvent !== "all" ? "Try a different filter" : "Share your code to start earning"}
          />
        </div>
      ) : (
        <div className="space-y-5 rep-slide-up" style={{ animationDelay: "100ms" }}>
          {groups.map((group) => (
            <div key={group.label}>
              <HudSectionHeader
                label={group.label}
                extra={`${group.sales.length} sale${group.sales.length !== 1 ? "s" : ""}`}
              />
              <div className="space-y-2">
                {group.sales.map((sale, i) => (
                  <Card
                    key={sale.id}
                    className="py-0 gap-0 rep-slide-up hover:-translate-y-0.5 transition-transform"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <CardContent className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10">
                          <TrendingUp size={14} className="text-success" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-mono text-foreground">{sale.order_number}</p>
                            {sale.status === "refunded" && (
                              <Badge variant="destructive" className="text-[8px] px-1 py-0">Refunded</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {sale.event?.name || "—"}
                            <span className="mx-1.5">·</span>
                            {formatRelativeDate(sale.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-primary">
                          <Zap size={9} />+10
                        </span>
                        <p className="text-sm font-bold font-mono text-success tabular-nums">
                          {getCurrencySymbol(sale.currency)}{Number(sale.total).toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
