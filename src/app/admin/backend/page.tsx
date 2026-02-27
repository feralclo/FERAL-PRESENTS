"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { FunnelChart } from "@/components/admin/dashboard/FunnelChart";
import { fmtMoney } from "@/lib/format";
import {
  Users,
  PoundSterling,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface DashboardData {
  tenants: { total: number; this_week: number; this_month: number };
  financial: {
    all_time: { gmv: number; platform_fees: number; orders: number };
    this_week: { gmv: number; platform_fees: number; orders: number };
    this_month: { gmv: number; platform_fees: number; orders: number };
  };
  onboarding_funnel: { label: string; count: number }[];
  recent_signups: {
    org_id: string;
    email: string;
    name: string;
    display_name: string;
    created_at: string;
  }[];
  recent_orders: {
    order_number: string;
    total: number;
    org_id: string;
    display_name: string;
    created_at: string;
  }[];
  top_tenants: {
    org_id: string;
    display_name: string;
    gmv: number;
    orders_count: number;
  }[];
}

function formatCurrency(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) {
    // Use fmtMoney for the symbol, trim trailing zeros for compact display
    const val = (pounds / 1000).toFixed(1);
    return fmtMoney(Number(val)).replace(/0$/, "") + "k";
  }
  return fmtMoney(pounds);
}

function formatCurrencyFull(pence: number): string {
  return fmtMoney(pence / 100);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function TopTenantsTable({ tenants }: { tenants: DashboardData["top_tenants"] }) {
  if (tenants.length === 0) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Top Tenants by GMV
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">No orders yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Top Tenants by GMV
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="space-y-2.5">
          {tenants.map((t, i) => (
            <div key={t.org_id} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary font-mono text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <Link
                  href={`/admin/backend/tenants/${t.org_id}/`}
                  className="truncate text-[13px] font-medium text-foreground hover:text-primary transition-colors"
                >
                  {t.display_name}
                </Link>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
                  {formatCurrency(t.gmv)}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {t.orders_count} orders
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentSignupsTable({ signups }: { signups: DashboardData["recent_signups"] }) {
  if (signups.length === 0) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Recent Signups
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">No signups yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Recent Signups
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="space-y-2.5">
          {signups.map((s) => (
            <div key={s.org_id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/backend/tenants/${s.org_id}/`}
                  className="block truncate text-[13px] font-medium text-foreground hover:text-primary transition-colors"
                >
                  {s.display_name}
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">{s.email}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {timeAgo(s.created_at)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentOrdersTable({ orders }: { orders: DashboardData["recent_orders"] }) {
  if (orders.length === 0) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Recent Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">No orders yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Recent Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="space-y-2.5">
          {orders.map((o) => (
            <div key={o.order_number} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] font-semibold text-foreground">
                  {o.order_number}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{o.display_name}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
                  {formatCurrencyFull(o.total)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(o.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/platform/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error || "Failed to load dashboard"}</p>
        <Button variant="outline" size="sm" onClick={() => fetchData()}>
          Retry
        </Button>
      </div>
    );
  }

  const { tenants, financial, onboarding_funnel, recent_signups, recent_orders, top_tenants } = data;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Platform Overview
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Your platform at a glance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Primary stat cards — 4-col grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tenants"
          value={String(tenants.total)}
          icon={Users}
          detail={tenants.this_month > 0 ? `+${tenants.this_month} this month` : "No new signups this month"}
        />
        <StatCard
          label="Signups This Week"
          value={String(tenants.this_week)}
          icon={Calendar}
          detail={tenants.this_month > 0 ? `${tenants.this_month} this month` : undefined}
        />
        <StatCard
          label="Total GMV"
          value={formatCurrency(financial.all_time.gmv)}
          icon={PoundSterling}
          detail={`${financial.all_time.orders.toLocaleString()} orders all time`}
        />
        <StatCard
          label="Est. Platform Fees"
          value={formatCurrency(financial.all_time.platform_fees)}
          icon={TrendingUp}
          detail="All time estimated revenue"
        />
      </div>

      {/* Secondary stat cards — 3-col grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="GMV This Week"
          value={formatCurrency(financial.this_week.gmv)}
          icon={PoundSterling}
          size="compact"
          detail={`${formatCurrency(financial.this_week.platform_fees)} est. fees`}
        />
        <StatCard
          label="Orders This Week"
          value={String(financial.this_week.orders)}
          icon={ShoppingCart}
          size="compact"
          detail={`${financial.this_month.orders} this month`}
        />
        <StatCard
          label="Orders All Time"
          value={financial.all_time.orders.toLocaleString()}
          icon={ShoppingCart}
          size="compact"
          detail={`${formatCurrency(financial.all_time.gmv)} total GMV`}
        />
      </div>

      {/* Funnel + Top Tenants — 2-col grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelChart stages={onboarding_funnel} title="Onboarding Funnel" />
        <TopTenantsTable tenants={top_tenants} />
      </div>

      {/* Recent Signups + Recent Orders — 2-col grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentSignupsTable signups={recent_signups} />
        <RecentOrdersTable orders={recent_orders} />
      </div>
    </div>
  );
}
