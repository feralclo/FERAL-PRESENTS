"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { LiveStatCard } from "@/components/ui/live-stat-card";
import { StripeConnectionBanner } from "@/components/admin/dashboard/StripeConnectionBanner";
import { CheckoutHealthBanner } from "@/components/admin/dashboard/CheckoutHealthBanner";
import { OnboardingChecklist } from "@/components/admin/OnboardingChecklist";
import { RevenueHero } from "@/components/admin/dashboard/RevenueHero";
import { PresenceCards } from "@/components/admin/dashboard/PresenceCards";
import { BuyerJourney } from "@/components/admin/dashboard/BuyerJourney";
import { EventSpotlight } from "@/components/admin/dashboard/EventSpotlight";
import { LiveFeed } from "@/components/admin/dashboard/LiveFeed";
import { MilestoneBar } from "@/components/admin/dashboard/MilestoneBar";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { fmtMoney } from "@/lib/format";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import {
  Ticket,
  DollarSign,
  ShoppingBag,
  MousePointerClick,
  CalendarDays,
  ChevronRight,
  BarChart3,
  UserCheck,
  Users as UsersIcon,
  Radar,
} from "lucide-react";

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
   MISSION CONTROL DASHBOARD
   ════════════════════════════════════════════════════════ */

export default function AdminDashboard() {
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const { currency: orgCurrency, currencySymbol: orgCurrencySymbol } = useOrgCurrency();
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; chargesEnabled: boolean } | null>(null);
  const [checkoutHealth, setCheckoutHealth] = useState<{
    status: "healthy" | "degraded" | "down";
    errors_1h: number;
    last_error_message: string | null;
  } | null>(null);

  // Strip the legacy ?welcome=1 hand-off param. The OnboardingChecklist below
  // is the canonical "what's next" surface — no separate welcome banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [, stripeRes] = await Promise.all([
          (async () => {
            const supabase = getSupabaseClient();
            if (!supabase) return;
            const { data } = await supabase.auth.getUser();
            if (data.user?.app_metadata?.is_platform_owner === true) setIsPlatformOwner(true);
          })(),
          fetch("/api/stripe/connect/my-account").catch(() => null),
        ]);
        if (stripeRes?.ok) {
          const json = await stripeRes.json();
          setStripeStatus({ connected: !!json.connected, chargesEnabled: !!json.charges_enabled });
        } else {
          setStripeStatus({ connected: false, chargesEnabled: false });
        }
      } catch { /* Fail silently */ }
    })();
  }, []);

  // Checkout health: fetch on mount + poll every 60s
  useEffect(() => {
    const fetchCheckoutHealth = async () => {
      try {
        const res = await fetch("/api/admin/checkout-health");
        if (res.ok) {
          const json = await res.json();
          setCheckoutHealth(json);
        }
      } catch { /* Fail silently */ }
    };
    fetchCheckoutHealth();
    const interval = setInterval(fetchCheckoutHealth, 60_000);
    return () => clearInterval(interval);
  }, []);

  const {
    activeVisitors, activeCarts, inCheckout,
    today, yesterday, funnel, activityFeed, topEvents,
    isLoading, presenceHistory, saleStreak, lastSale,
    milestones, hourlyRevenue, eventCapacity,
  } = useDashboardRealtime();

  return (
    <div className="space-y-5">
      {/* Onboarding checklist — shows what's left for new tenants. Hides itself
          once everything is done or all items are dismissed. */}
      {!isPlatformOwner && <OnboardingChecklist />}

      {/* Stripe connection banner */}
      {!isPlatformOwner && stripeStatus && (!stripeStatus.connected || !stripeStatus.chargesEnabled) && (
        <StripeConnectionBanner connected={stripeStatus.connected} chargesEnabled={stripeStatus.chargesEnabled} />
      )}

      {/* Checkout health banner */}
      {checkoutHealth && checkoutHealth.status !== "healthy" && (
        <CheckoutHealthBanner
          status={checkoutHealth.status}
          errors1h={checkoutHealth.errors_1h}
          lastErrorMessage={checkoutHealth.last_error_message}
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <LiveIndicator color="success" size="sm" />
            Mission control
          </p>
        </div>
        <Link
          href="/admin/command/"
          className="group flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[2px] text-primary/70 transition-all duration-300 hover:border-primary/40 hover:bg-primary/10 hover:text-primary hover:shadow-[0_0_30px_rgba(139,92,246,0.15)]"
        >
          <Radar size={15} className="transition-transform duration-300 group-hover:scale-110" />
          Command
        </Link>
      </div>

      {/* ── REVENUE HERO ── */}
      <RevenueHero
        revenue={today.revenue}
        yesterdayRevenue={yesterday.revenue}
        orders={today.orders}
        ticketsSold={today.ticketsSold}
        avgOrderValue={today.avgOrderValue}
        hourlyRevenue={hourlyRevenue}
        currencySymbol={orgCurrencySymbol}
        lastSale={lastSale}
        isLoading={isLoading}
      />

      {/* ── MILESTONES ── */}
      {milestones.length > 0 && <MilestoneBar milestones={milestones} />}

      {/* ── PRESENCE CARDS — own row ── */}
      <PresenceCards
        visitors={activeVisitors}
        carts={activeCarts}
        checkout={inCheckout}
        history={presenceHistory}
        isLoading={isLoading}
      />

      {/* ── KPI CARDS — own row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          value={isLoading ? "\u00A0" : fmtMoney(today.avgOrderValue, orgCurrency)}
          icon={DollarSign}
          detail="vs yesterday"
          trend={{ value: today.avgOrderValue - yesterday.avgOrderValue, format: "currency", currencySymbol: orgCurrencySymbol }}
        />
        <LiveStatCard
          label="Conversion"
          value={isLoading ? "\u00A0" : `${today.conversionRate.toFixed(1)}%`}
          icon={MousePointerClick}
          detail="vs yesterday"
          trend={{ value: today.conversionRate - yesterday.conversionRate, format: "percent" }}
        />
      </div>

      {/* ── BUYER JOURNEY ── */}
      <BuyerJourney funnel={funnel} />

      {/* ── EVENT SPOTLIGHT + LIVE FEED — equal columns ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EventSpotlight
          events={topEvents}
          currencySymbol={orgCurrencySymbol}
          eventCapacity={eventCapacity}
        />
        <LiveFeed items={activityFeed} saleStreak={saleStreak} />
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="pt-4">
        <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Quick Links
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/admin/events/" icon={CalendarDays} title="Events" description="Manage events & tickets" />
          <QuickLink href="/admin/orders/" icon={BarChart3} title="Orders" description="View & manage orders" />
          <QuickLink href="/admin/customers/" icon={UsersIcon} title="Customers" description="Customer profiles" />
          <QuickLink href="/admin/guest-list/" icon={UserCheck} title="Guest List" description="Check-in management" />
        </div>
      </div>
    </div>
  );
}
