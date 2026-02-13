"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  Ticket,
  DollarSign,
  ShoppingBag,
  Shirt,
  TrendingUp,
  Globe,
  MousePointerClick,
  Activity,
  CalendarDays,
  ChevronRight,
  BarChart3,
  Users,
  UserCheck,
} from "lucide-react";

/* ── Types ── */
type Period = "today" | "7d" | "30d" | "all";

interface KPIStats {
  revenue: number;
  orders: number;
  ticketsSold: number;
  merchRevenue: number;
}

interface TrafficStats {
  totalTraffic: number;
  todayTraffic: number;
  conversionRate: string;
  activeEvents: number;
}

/* ── Period selector ── */
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "all", label: "All Time" },
];

function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-all duration-150 ${
            period === p.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ── Stat card ── */
function StatCard({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  detail?: string;
}) {
  return (
    <Card className="group relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-foreground">
              {value}
            </p>
            {detail && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {detail}
              </p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <Icon size={18} strokeWidth={1.75} className="text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Quick link card ── */
function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="overflow-hidden transition-colors duration-150 hover:border-muted-foreground/20">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted transition-all duration-150 group-hover:bg-accent">
            <Icon size={18} className="text-muted-foreground transition-colors group-hover:text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          <ChevronRight
            size={16}
            className="text-muted-foreground/30 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          />
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── Helpers ── */
function getDateStart(period: Period): string | null {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "all":
      return null;
  }
}

function periodLabel(period: Period): string {
  switch (period) {
    case "today": return "today";
    case "7d": return "in the last 7 days";
    case "30d": return "in the last 30 days";
    case "all": return "all time";
  }
}

/* ════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPIStats>({
    revenue: 0,
    orders: 0,
    ticketsSold: 0,
    merchRevenue: 0,
  });
  const [traffic, setTraffic] = useState<TrafficStats>({
    totalTraffic: 0,
    todayTraffic: 0,
    conversionRate: "0%",
    activeEvents: 0,
  });

  const loadKPIs = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const dateStart = getDateStart(period);

    // Fetch completed orders with items (for merch calculation)
    let ordersQuery = supabase
      .from(TABLES.ORDERS)
      .select("id, total, status, created_at")
      .eq("org_id", ORG_ID)
      .eq("status", "completed");

    if (dateStart) ordersQuery = ordersQuery.gte("created_at", dateStart);

    const { data: orders } = await ordersQuery;

    const revenue = (orders || []).reduce((s, o) => s + Number(o.total), 0);
    const orderCount = (orders || []).length;

    // Tickets sold in period
    let ticketsQuery = supabase
      .from(TABLES.TICKETS)
      .select("*", { count: "exact", head: true })
      .eq("org_id", ORG_ID);

    if (dateStart) ticketsQuery = ticketsQuery.gte("created_at", dateStart);

    const { count: ticketCount } = await ticketsQuery;

    // Merch revenue — order items with merch_size not null
    const orderIds = (orders || []).map((o) => o.id);
    let merchRevenue = 0;

    if (orderIds.length > 0) {
      const { data: merchItems } = await supabase
        .from(TABLES.ORDER_ITEMS)
        .select("unit_price, qty")
        .eq("org_id", ORG_ID)
        .in("order_id", orderIds)
        .not("merch_size", "is", null);

      merchRevenue = (merchItems || []).reduce(
        (s, item) => s + Number(item.unit_price) * item.qty,
        0
      );
    }

    setKpi({
      revenue,
      orders: orderCount,
      ticketsSold: ticketCount || 0,
      merchRevenue,
    });
    setLoading(false);
  }, [period]);

  const loadTraffic = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const today = new Date().toISOString().split("T")[0];

    const [
      { count: trafficCount },
      { count: todayCount },
      { count: checkoutCount },
      { count: landingCount },
      { count: eventCount },
    ] = await Promise.all([
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true }),
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .gte("timestamp", today),
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "checkout"),
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "landing"),
      supabase
        .from(TABLES.EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("org_id", ORG_ID)
        .in("status", ["draft", "live"]),
    ]);

    const rate =
      landingCount && checkoutCount
        ? ((checkoutCount / landingCount) * 100).toFixed(1) + "%"
        : "0%";

    setTraffic({
      totalTraffic: trafficCount || 0,
      todayTraffic: todayCount || 0,
      conversionRate: rate,
      activeEvents: eventCount || 0,
    });
  }, []);

  useEffect(() => {
    loadKPIs();
  }, [loadKPIs]);

  useEffect(() => {
    loadTraffic();
  }, [loadTraffic]);

  return (
    <div>
      {/* Header with period selector */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Performance overview {periodLabel(period)}
          </p>
        </div>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={loading ? "..." : `£${kpi.revenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          detail={`Completed orders ${periodLabel(period)}`}
        />
        <StatCard
          label="Orders"
          value={loading ? "..." : kpi.orders.toLocaleString()}
          icon={ShoppingBag}
          detail={`Total completed ${periodLabel(period)}`}
        />
        <StatCard
          label="Tickets Sold"
          value={loading ? "..." : kpi.ticketsSold.toLocaleString()}
          icon={Ticket}
          detail={`Individual tickets issued`}
        />
        <StatCard
          label="Merch Revenue"
          value={loading ? "..." : `£${kpi.merchRevenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={Shirt}
          detail={`From merchandise add-ons`}
        />
      </div>

      {/* Traffic Section */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-[2px] text-muted-foreground">
          Traffic & Engagement
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Traffic"
            value={traffic.totalTraffic.toLocaleString()}
            icon={Globe}
            detail="All page views"
          />
          <StatCard
            label="Today's Traffic"
            value={traffic.todayTraffic.toLocaleString()}
            icon={TrendingUp}
            detail="Page views today"
          />
          <StatCard
            label="Conversion Rate"
            value={traffic.conversionRate}
            icon={MousePointerClick}
            detail="Landing → Checkout"
          />
          <StatCard
            label="Active Events"
            value={traffic.activeEvents.toString()}
            icon={Activity}
            detail="Draft or live"
          />
        </div>
      </div>

      {/* Quick Links */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-[2px] text-muted-foreground">
          Quick Links
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/admin/events/"
            icon={CalendarDays}
            title="Events"
            description="Manage events & tickets"
          />
          <QuickLink
            href="/admin/orders/"
            icon={BarChart3}
            title="Orders"
            description="View & manage orders"
          />
          <QuickLink
            href="/admin/customers/"
            icon={Users}
            title="Customers"
            description="Customer profiles"
          />
          <QuickLink
            href="/admin/guest-list/"
            icon={UserCheck}
            title="Guest List"
            description="Check-in management"
          />
        </div>
      </div>
    </div>
  );
}
