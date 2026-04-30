"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  ShoppingCart,
  CreditCard,
  Globe,
  Calendar,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/ui";
import { SalesTimelineCard } from "@/components/admin/canvas/sections/SalesTimelineCard";
import { TierCard } from "@/components/admin/event-overview/TierCard";
import { EventViewTabs } from "@/components/admin/event-overview/EventViewTabs";
import { fmtMoney } from "@/lib/format";
import { relativeTimeShort } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import type { OverviewResponse } from "@/components/admin/event-overview/types";
import { buildTimelineSeries } from "@/lib/sales-velocity";

/**
 * Event overview — the analytics dashboard. Default landing page for
 * any non-draft event clicked from the events list. Aims to answer
 * everything a host wants when they ask "how are we doing?":
 *
 *   - Top headline KPIs with day-over-day deltas
 *   - Sales timeline (cumulative + daily) with anchored projection
 *   - Per-tier cards (replaces the dense rows of the old editor card)
 *   - Conversion funnel (page views → cart → paid, last 30d)
 *   - Top sources (referrer host + UTM source, last 30d)
 *   - Payment-method breakdown (count + revenue)
 *   - Recent orders (last 10)
 *
 * Editorial layout. Hosts spend most of an event's lifetime here, not
 * in the editor — quality of this page disproportionately affects how
 * the platform feels.
 */

const STATUS_VARIANT: Record<
  string,
  "warning" | "success" | "secondary" | "default" | "destructive"
> = {
  draft: "warning",
  live: "success",
  past: "secondary",
  cancelled: "destructive",
  archived: "secondary",
};

export default function EventOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    setErrorMsg("");
    try {
      // We need the event id, but the URL is keyed by slug. Resolve via
      // the existing /api/events query — the list endpoint already
      // returns id+slug for the org.
      const evRes = await fetch("/api/events", { cache: "no-store" });
      if (!evRes.ok) throw new Error("Couldn't load event list");
      const evJson = await evRes.json();
      type ListEvent = { id: string; slug: string };
      const match = (evJson.data as ListEvent[] | undefined)?.find(
        (e) => e.slug === slug
      );
      if (!match) {
        setErrorMsg("Event not found");
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const ovRes = await fetch(`/api/events/${match.id}/overview`, {
        cache: "no-store",
      });
      if (!ovRes.ok) {
        const j = await ovRes.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't load overview");
      }
      const json = (await ovRes.json()) as OverviewResponse;
      setData(json);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't load overview"
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Per-tier daily series — fold the buckets to a per-tier daily array
  // ONCE here, then pass slices to each TierCard. Avoids re-folding the
  // bucket array N times in the grid.
  const dailySeriesByTier = useMemo(() => {
    if (!data) return new Map<string, number[]>();
    const out = new Map<string, number[]>();
    for (const tier of data.ticketTypes) {
      const series = buildTimelineSeries(data.buckets, tier.id);
      out.set(
        tier.id,
        series.daily.map((b) => b.qty)
      );
    }
    return out;
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <div className="flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-primary/70" />
            <span className="text-sm text-muted-foreground">
              Loading overview…
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="p-6 lg:p-8">
        <Link
          href="/admin/events/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to events
        </Link>
        <AdminCard className="px-5 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            {errorMsg || "Couldn't load overview"}
          </p>
          <Button variant="outline" size="sm" onClick={load} className="mt-4">
            Try again
          </Button>
        </AdminCard>
      </div>
    );
  }

  const { event, totals, windows, ticketTypes, recent_orders, payment_methods, funnel, sources } =
    data;
  const isDraft = event.status === "draft";

  // Trends (today vs ~7-day average) — informational, not a hard metric.
  const todayVsAvg =
    windows.last_7d.sold > 0
      ? Math.round(
          ((windows.today.sold - windows.last_7d.sold / 7) /
            (windows.last_7d.sold / 7)) *
            100
        )
      : null;

  const weekDelta =
    windows.prev_7d.sold > 0
      ? Math.round(
          ((windows.last_7d.sold - windows.prev_7d.sold) /
            windows.prev_7d.sold) *
            100
        )
      : null;

  const capacityPct =
    totals.capacity && totals.capacity > 0
      ? Math.min(100, Math.round((totals.sold / totals.capacity) * 100))
      : null;

  return (
    <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Link
            href="/admin/events/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Events
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
                {event.name}
              </h1>
              <Badge variant={STATUS_VARIANT[event.status] ?? "secondary"}>
                {event.status}
              </Badge>
              <span className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">
                /event/{event.slug}/
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={refreshing}
                title="Refresh"
              >
                {refreshing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Refresh
              </Button>
              <EventViewTabs slug={slug} active="overview" />
            </div>
          </div>
        </div>

        {/* Draft state — show a helpful nudge, not a wall of zeros */}
        {isDraft ? (
          <AdminCard className="space-y-3 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              This event isn&rsquo;t live yet
            </p>
            <p className="text-xs text-muted-foreground">
              Analytics will appear once you publish. For now, finish the setup
              in the editor.
            </p>
            <Button
              size="sm"
              className="mx-auto mt-2 w-fit"
              onClick={() => router.push(`/admin/events/${slug}/`)}
            >
              Open editor
            </Button>
          </AdminCard>
        ) : (
          <>
            {/* ── KPI Headlines ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi
                label="Tickets sold"
                icon={<Users size={13} className="text-muted-foreground/70" />}
                value={totals.sold.toLocaleString()}
                sublineLeft={
                  windows.today.sold > 0
                    ? `+${windows.today.sold} today`
                    : "no sales today"
                }
                deltaPct={todayVsAvg}
                deltaLabel="vs 7d avg"
              />
              <Kpi
                label="Revenue"
                icon={
                  <CreditCard size={13} className="text-muted-foreground/70" />
                }
                value={fmtMoney(totals.revenue, event.currency)}
                sublineLeft={
                  windows.today.revenue > 0
                    ? `+${fmtMoney(windows.today.revenue, event.currency)} today`
                    : "—"
                }
                deltaPct={weekDelta}
                deltaLabel="vs prior 7d"
                accent="success"
              />
              <Kpi
                label="Capacity"
                icon={<Globe size={13} className="text-muted-foreground/70" />}
                value={
                  totals.capacity
                    ? `${capacityPct ?? 0}%`
                    : "Unlimited"
                }
                sublineLeft={
                  totals.capacity
                    ? `${totals.sold.toLocaleString()} of ${totals.capacity.toLocaleString()}`
                    : `${totals.sold.toLocaleString()} sold`
                }
                progressPct={capacityPct}
              />
              <Kpi
                label="Paid orders"
                icon={
                  <ShoppingCart size={13} className="text-muted-foreground/70" />
                }
                value={totals.paid_orders.toLocaleString()}
                sublineLeft={
                  totals.refunded_revenue > 0
                    ? `${fmtMoney(totals.refunded_revenue, event.currency)} refunded`
                    : "no refunds"
                }
              />
            </div>

            {/* ── Event meta strip ───────────────────────────────── */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-border/40 bg-card/30 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={11} />
                {new Date(event.date_start).toLocaleString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={11} />
                {event.payment_method ?? "no payment method"}
              </span>
            </div>

            {/* ── Sales timeline ─────────────────────────────────── */}
            <SalesTimelineCard
              buckets={data.buckets}
              ticketTypes={data.ticketTypes.map((t) => ({
                id: t.id,
                name: t.name,
              }))}
              currency={event.currency}
              eventDateStart={event.date_start}
            />

            {/* ── Per-tier cards ─────────────────────────────────── */}
            {ticketTypes.length > 0 && (
              <section className="space-y-3">
                <SectionHeading
                  eyebrow="Tiers"
                  title="Ticket-type breakdown"
                  hint="One card per tier — sold, capacity, revenue, pace."
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ticketTypes.map((tier) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      dailyQty={dailySeriesByTier.get(tier.id) ?? []}
                      currency={event.currency}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Funnel + Sources ───────────────────────────────── */}
            <div className="grid gap-3 lg:grid-cols-2">
              <FunnelCard funnel={funnel} />
              <SourcesCard sources={sources} />
            </div>

            {/* ── Payment methods + Recent orders ────────────────── */}
            <div className="grid gap-3 lg:grid-cols-2">
              <PaymentMethodsCard
                methods={payment_methods}
                currency={event.currency}
              />
              <RecentOrdersCard
                orders={recent_orders}
                currency={event.currency}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Kpi({
  label,
  icon,
  value,
  sublineLeft,
  deltaPct,
  deltaLabel,
  progressPct,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sublineLeft: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  progressPct?: number | null;
  accent?: "success";
}) {
  const positive = deltaPct != null && deltaPct > 0;
  const negative = deltaPct != null && deltaPct < 0;
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          {label}
        </span>
        {icon}
      </div>
      <p
        className={cn(
          "mt-3 font-mono text-[26px] font-bold leading-none tabular-nums",
          accent === "success" ? "text-success" : "text-foreground"
        )}
      >
        {value}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[10px] tabular-nums text-muted-foreground/85">
          {sublineLeft}
        </span>
        {deltaPct != null && deltaLabel && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums",
              positive
                ? "text-success"
                : negative
                  ? "text-destructive"
                  : "text-muted-foreground/70"
            )}
            title={deltaLabel}
          >
            {positive ? (
              <ArrowUpRight size={10} />
            ) : negative ? (
              <ArrowDownRight size={10} />
            ) : null}
            {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
          </span>
        )}
      </div>
      {progressPct != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div
            className={cn(
              "h-full transition-all",
              progressPct >= 90
                ? "bg-success"
                : progressPct >= 50
                  ? "bg-primary"
                  : "bg-primary/55"
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
        {title}
      </h3>
      {hint && (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function FunnelCard({
  funnel,
}: {
  funnel: OverviewResponse["funnel"];
}) {
  const max = Math.max(
    funnel.page_views,
    funnel.cart_started,
    funnel.paid,
    1
  );
  const stages: { label: string; count: number; tone: string }[] = [
    {
      label: "Page views",
      count: funnel.page_views,
      tone: "bg-primary/55",
    },
    {
      label: "Started checkout",
      count: funnel.cart_started,
      tone: "bg-primary/75",
    },
    {
      label: "Paid",
      count: funnel.paid,
      tone: "bg-success",
    },
  ];

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Conversion · last 30 days
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
            {funnel.conversion_pct == null
              ? "Funnel"
              : `${funnel.conversion_pct}% page → paid`}
          </h3>
        </div>
        <TrendingUp size={14} className="text-muted-foreground/60" />
      </div>
      <ul className="mt-4 space-y-2">
        {stages.map((stage) => {
          const pct = (stage.count / max) * 100;
          return (
            <li key={stage.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-foreground/85">
                  {stage.label}
                </span>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
                  {stage.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
                <div
                  className={cn("h-full transition-all", stage.tone)}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {funnel.page_views === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No page-view data yet — tracking starts the moment your event
          page loads in a browser.
        </p>
      )}
    </div>
  );
}

function SourcesCard({
  sources,
}: {
  sources: OverviewResponse["sources"];
}) {
  const refMax = Math.max(
    1,
    ...sources.referrers.map((r) => r.count),
    ...sources.utm_sources.map((u) => u.count)
  );
  const hasAny =
    sources.referrers.length > 0 || sources.utm_sources.length > 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        Where buyers come from · last 30 days
      </p>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
        Top sources
      </h3>
      {!hasAny ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No traffic data yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {sources.referrers.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
                Referrers
              </p>
              {sources.referrers.map((r) => (
                <SourceRow
                  key={r.referrer}
                  label={r.referrer}
                  count={r.count}
                  pct={(r.count / refMax) * 100}
                />
              ))}
            </div>
          )}
          {sources.utm_sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
                UTM source
              </p>
              {sources.utm_sources.map((u) => (
                <SourceRow
                  key={u.utm_source}
                  label={u.utm_source}
                  count={u.count}
                  pct={(u.count / refMax) * 100}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceRow({
  label,
  count,
  pct,
}: {
  label: string;
  count: number;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
        {label}
      </span>
      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-foreground/[0.04] sm:block">
        <div
          className="h-full bg-primary/55"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {count.toLocaleString()}
      </span>
    </div>
  );
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  stripe: "Card · Stripe",
  test: "Test mode",
  external: "External link",
  imported: "CSV import",
  unknown: "Unknown",
};

function PaymentMethodsCard({
  methods,
  currency,
}: {
  methods: OverviewResponse["payment_methods"];
  currency: string;
}) {
  const totalRevenue = methods.reduce((acc, m) => acc + m.revenue, 0);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        Payment methods
      </p>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
        How buyers pay
      </h3>
      {methods.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No completed orders yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {methods.map((m) => {
            const pct =
              totalRevenue > 0 ? (m.revenue / totalRevenue) * 100 : 0;
            return (
              <li key={m.method} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-foreground/85">
                    {PAYMENT_METHOD_LABEL[m.method] ?? m.method}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-foreground">
                    {fmtMoney(m.revenue, currency)}
                    <span className="ml-2 text-[10px] text-muted-foreground/70">
                      {m.count.toLocaleString()} order
                      {m.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
                  <div
                    className="h-full bg-primary/65"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecentOrdersCard({
  orders,
  currency,
}: {
  orders: OverviewResponse["recent_orders"];
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Recent orders
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
            Last 10
          </h3>
        </div>
        <Link
          href="/admin/orders/"
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary hover:underline"
        >
          All orders →
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No orders yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/30">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {o.customer_name}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                    {o.order_number}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {o.tier_summary}
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono text-[12px] font-semibold tabular-nums text-success">
                  {fmtMoney(o.total, o.currency || currency)}
                </div>
                <div className="font-mono text-[9px] tabular-nums text-muted-foreground/70">
                  {relativeTimeShort(o.created_at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
