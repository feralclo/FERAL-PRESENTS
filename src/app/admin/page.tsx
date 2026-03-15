"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { LiveStatCard } from "@/components/ui/live-stat-card";
import { StripeConnectionBanner } from "@/components/admin/dashboard/StripeConnectionBanner";
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
  X,
  Rocket,
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

/* ── Welcome Banner ── */
function WelcomeBanner({
  onDismiss,
  stripeConnected,
}: {
  onDismiss: () => void;
  stripeConnected?: boolean;
}) {
  const needsStripe = stripeConnected === false;

  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="h-full w-1 self-stretch rounded-full bg-gradient-to-b from-primary to-primary/50" />
      <Rocket size={20} className="shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Welcome to Entry!</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {needsStripe
            ? "Set up payments to start selling tickets."
            : "Create your first event to start selling tickets."}
        </p>
      </div>
      <Link
        href={needsStripe ? "/admin/payments/" : "/admin/events/"}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/85"
      >
        {needsStripe ? "Set Up Payments" : "Create Event"}
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

/* ════════════════════════════════════════════════════════
   MISSION CONTROL DASHBOARD
   ════════════════════════════════════════════════════════ */

export default function AdminDashboard() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const { currency: orgCurrency, currencySymbol: orgCurrencySymbol } = useOrgCurrency();
  const [stripeStatus, setStripeStatus] = useState<{
    connected: boolean;
    chargesEnabled: boolean;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setShowWelcome(true);
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
            if (data.user?.app_metadata?.is_platform_owner === true) {
              setIsPlatformOwner(true);
            }
          })(),
          fetch("/api/stripe/connect/my-account").catch(() => null),
        ]);

        if (stripeRes?.ok) {
          const json = await stripeRes.json();
          setStripeStatus({
            connected: !!json.connected,
            chargesEnabled: !!json.charges_enabled,
          });
        } else {
          setStripeStatus({ connected: false, chargesEnabled: false });
        }
      } catch {
        // Fail silently
      }
    })();
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
    presenceHistory,
    saleStreak,
    lastSale,
    milestones,
    hourlyRevenue,
    eventCapacity,
  } = useDashboardRealtime();

  return (
    <div>
      {/* Stripe connection banner */}
      {!isPlatformOwner &&
        stripeStatus &&
        (!stripeStatus.connected || !stripeStatus.chargesEnabled) && (
          <StripeConnectionBanner
            connected={stripeStatus.connected}
            chargesEnabled={stripeStatus.chargesEnabled}
          />
        )}

      {/* Welcome banner */}
      {showWelcome && (
        <WelcomeBanner
          onDismiss={() => setShowWelcome(false)}
          stripeConnected={stripeStatus?.connected && stripeStatus?.chargesEnabled}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <LiveIndicator color="success" size="sm" />
            Mission control
          </p>
        </div>
      </div>

      {/* ── REVENUE HERO ── */}
      <div className="mb-5">
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
      </div>

      {/* ── MILESTONES — right under revenue for max impact ── */}
      {milestones.length > 0 && (
        <div className="mb-5">
          <MilestoneBar milestones={milestones} />
        </div>
      )}

      {/* ── PRESENCE + KPIs — combined row ── */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-7">
        {/* Presence cards: 3 columns */}
        <div className="lg:col-span-3">
          <PresenceCards
            visitors={activeVisitors}
            carts={activeCarts}
            checkout={inCheckout}
            history={presenceHistory}
            isLoading={isLoading}
          />
        </div>
        {/* KPI cards: 4 columns */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <LiveStatCard
            label="Orders"
            value={isLoading ? "\u00A0" : today.orders.toLocaleString()}
            icon={ShoppingBag}
            detail="vs yesterday"
            trend={{ value: today.orders - yesterday.orders, format: "number" }}
          />
          <LiveStatCard
            label="Tickets"
            value={isLoading ? "\u00A0" : today.ticketsSold.toLocaleString()}
            icon={Ticket}
            detail="vs yesterday"
            trend={{ value: today.ticketsSold - yesterday.ticketsSold, format: "number" }}
          />
          <LiveStatCard
            label="Avg Value"
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
      </div>

      {/* ── BUYER JOURNEY ── */}
      <div className="mb-5">
        <BuyerJourney funnel={funnel} />
      </div>

      {/* ── EVENT SPOTLIGHT + LIVE FEED ── */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EventSpotlight
          events={topEvents}
          currencySymbol={orgCurrencySymbol}
          eventCapacity={eventCapacity}
        />
        <LiveFeed items={activityFeed} saleStreak={saleStreak} />
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="mt-8">
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
