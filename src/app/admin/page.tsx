"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LiveStatCard } from "@/components/ui/live-stat-card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { ActivityFeed } from "@/components/admin/dashboard/ActivityFeed";
import { FunnelChart } from "@/components/admin/dashboard/FunnelChart";
import { TopEventsTable } from "@/components/admin/dashboard/TopEventsTable";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import {
  Ticket,
  DollarSign,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  Users as UsersIcon,
  MousePointerClick,
  CalendarDays,
  ChevronRight,
  BarChart3,
  UserCheck,
  X,
  Rocket,
} from "lucide-react";

/* ── Skeleton pulse ── */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted/60 ${className || ""}`}
    />
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
      <Card className="transition-all duration-200 hover:border-primary/20 hover:shadow-[0_0_30px_rgba(139,92,246,0.06)]">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10 transition-all duration-200 group-hover:bg-primary/12 group-hover:ring-primary/20">
            <Icon size={18} className="text-primary/60 transition-colors duration-200 group-hover:text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          <ChevronRight
            size={16}
            className="text-muted-foreground/0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary/50"
          />
        </CardContent>
      </Card>
    </Link>
  );
}

/* ════════════════════════════════════════════════════════
   LIVE DASHBOARD
   ════════════════════════════════════════════════════════ */
function WelcomeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="h-full w-1 self-stretch rounded-full bg-gradient-to-b from-primary to-primary/50" />
      <Rocket size={20} className="shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Welcome to Entry!
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Create your first event to start selling tickets.
        </p>
      </div>
      <Link
        href="/admin/events/"
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/85"
      >
        Create Event
      </Link>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function AdminDashboard() {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setShowWelcome(true);
      // Clean the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const {
    activeVisitors,
    activeCarts,
    inCheckout,
    today,
    yesterday,
    funnel,
    activityFeed,
    topEvents,
    isLoading,
  } = useDashboardRealtime();

  return (
    <div>
      {/* Welcome banner */}
      {showWelcome && <WelcomeBanner onDismiss={() => setShowWelcome(false)} />}

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
            Dashboard
          </h1>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <LiveIndicator color="success" size="sm" />
            Live performance overview
          </p>
        </div>
      </div>

      {/* ── RIGHT NOW ── */}
      <div className="mb-10">
        <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Right Now
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <LiveStatCard
            label="Active Visitors"
            value={isLoading ? "\u00A0" : activeVisitors.toLocaleString()}
            icon={UsersIcon}
            detail="online now"
            live
          />
          <LiveStatCard
            label="Active Carts"
            value={isLoading ? "\u00A0" : activeCarts.toLocaleString()}
            icon={ShoppingCart}
            detail="open carts"
            live
          />
          <LiveStatCard
            label="In Checkout"
            value={isLoading ? "\u00A0" : inCheckout.toLocaleString()}
            icon={CreditCard}
            detail="checking out"
            live
          />
        </div>
      </div>

      {/* ── TODAY'S PERFORMANCE ── */}
      <div className="mb-10">
        <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Today&apos;s Performance
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <LiveStatCard
            label="Revenue"
            value={isLoading ? "\u00A0" : `£${today.revenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={DollarSign}
            detail="vs yesterday"
            trend={{ value: today.revenue - yesterday.revenue, format: "currency", currencySymbol: "£" }}
          />
          <LiveStatCard
            label="Orders"
            value={isLoading ? "\u00A0" : today.orders.toLocaleString()}
            icon={ShoppingBag}
            detail="vs yesterday"
            trend={{ value: today.orders - yesterday.orders, format: "number" }}
          />
          <LiveStatCard
            label="Tickets Sold"
            value={isLoading ? "\u00A0" : today.ticketsSold.toLocaleString()}
            icon={Ticket}
            detail="vs yesterday"
            trend={{ value: today.ticketsSold - yesterday.ticketsSold, format: "number" }}
          />
          <LiveStatCard
            label="Avg Order Value"
            value={isLoading ? "\u00A0" : `£${today.avgOrderValue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={DollarSign}
            detail="vs yesterday"
            trend={{ value: today.avgOrderValue - yesterday.avgOrderValue, format: "currency", currencySymbol: "£" }}
          />
          <LiveStatCard
            label="Conversion"
            value={isLoading ? "\u00A0" : `${today.conversionRate.toFixed(1)}%`}
            icon={MousePointerClick}
            detail="vs yesterday"
            trend={{ value: today.conversionRate - yesterday.conversionRate, format: "percent" }}
          />
        </div>
      </div>

      {/* ── TWO-COLUMN: FUNNEL + ACTIVITY ── */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: Funnel + Top Events */}
        <div className="space-y-6">
          <FunnelChart
            stages={[
              { label: "Landing", count: funnel.landing },
              { label: "Tickets", count: funnel.tickets },
              { label: "Add to Cart", count: funnel.add_to_cart },
              { label: "Checkout", count: funnel.checkout },
              { label: "Purchase", count: funnel.purchase },
            ]}
          />
          <TopEventsTable events={topEvents} />
        </div>

        {/* Right Column: Activity Feed */}
        <ActivityFeed items={activityFeed} />
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="mt-10">
        <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
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
            icon={UsersIcon}
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
