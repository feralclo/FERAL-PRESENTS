"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Sparkles,
  Calendar,
  Clock,
  Globe,
  Instagram,
  Facebook,
  Twitter,
  Search,
  Link2,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/ui";
import { MicroSparkline } from "@/components/admin/dashboard/MicroSparkline";
import { EventViewTabs } from "@/components/admin/event-overview/EventViewTabs";
import { fmtMoney } from "@/lib/format";
import { relativeTimeShort } from "@/lib/relative-time";
import { summariseEvent, todayVsRecentLabel } from "@/lib/event-summary";
import type { EventSummaryMood } from "@/lib/event-summary";
import { buildTimelineSeries } from "@/lib/sales-velocity";
import { cn } from "@/lib/utils";
import type {
  OverviewResponse,
  OverviewTicketType,
} from "@/components/admin/event-overview/types";

/**
 * Event overview — story-shaped, written for someone who has never
 * looked at analytics in their life. The whole layout reads top-to-
 * bottom like a friend texting you an update:
 *
 *   1. Hero summary    — "On track to sell out by Sat 5 May"
 *   2. Three cards     — Today / This week / Total. Plain English.
 *   3. Sales chart     — single cumulative line with anchored projection
 *   4. Tickets         — rows with status badges, no jargon
 *   5. Where they came from + Recent buyers (side by side)
 *   6. Show advanced   — disclosure for payment methods + UTM
 *
 * Replaces the previous dashboard-shaped layout (4 KPIs, double charts,
 * cards-with-sparklines for tiers, separate funnel widget). Same API,
 * same data, different priorities.
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setErrorMsg("");
    try {
      // Resolve event id from slug via the events list API.
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

  // Smart summary — derived from totals + windows + capacity.
  const summary = useMemo(() => {
    if (!data) return null;
    return summariseEvent({
      status: data.event.status,
      date_start: data.event.date_start,
      capacity: data.totals.capacity,
      totals: { sold: data.totals.sold, revenue: data.totals.revenue },
      windows: data.windows,
    });
  }, [data]);

  // Cumulative timeline series — one chart, full width.
  const cumulative = useMemo(() => {
    if (!data) return { values: [] as number[], lastDate: null as string | null };
    const series = buildTimelineSeries(data.buckets);
    return {
      values: series.cumulative.map((b) => b.qty),
      lastDate: series.cumulative.length
        ? series.cumulative[series.cumulative.length - 1].date
        : null,
    };
  }, [data]);

  // Anchored projection sentence — "At this pace you'll reach ~280 by Sat 5 May".
  const projection = useMemo(() => {
    if (!data) return null;
    const perDay = data.windows.last_7d.sold / 7;
    const eventDate = new Date(data.event.date_start);
    const now = Date.now();
    const daysUntil = (eventDate.getTime() - now) / (1000 * 60 * 60 * 24);
    if (perDay <= 0 || daysUntil <= 0.5) return null;
    const projected = Math.round(data.totals.sold + perDay * daysUntil);
    return {
      total: projected,
      eventDate,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-[1100px] space-y-6">
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

  return (
    <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1100px] space-y-5">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Link
            href="/admin/events/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Events
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
                {event.name}
              </h1>
              <Badge variant={STATUS_VARIANT[event.status] ?? "secondary"}>
                {event.status}
              </Badge>
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

        {/* Draft state */}
        {isDraft ? (
          <AdminCard className="space-y-3 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              This event isn&rsquo;t live yet
            </p>
            <p className="text-xs text-muted-foreground">
              Numbers will appear here once you publish. Finish the setup
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
            {/* ── Hero: smart summary ────────────────────────────── */}
            {summary && (
              <SmartSummary
                summary={summary}
                soldOf={totals.sold}
                capacity={totals.capacity}
                eventDate={new Date(event.date_start)}
              />
            )}

            {/* ── 3 cards: Today / This week / Total ─────────────── */}
            <div className="grid gap-3 sm:grid-cols-3">
              <SimpleStat
                label="Today"
                value={`${windows.today.sold.toLocaleString()} sold`}
                accent={windows.today.revenue > 0 ? "success" : undefined}
                subline={
                  windows.today.revenue > 0
                    ? `${fmtMoney(windows.today.revenue, event.currency)} · ${todayVsRecentLabel(windows.today.sold, windows.last_7d.sold)}`
                    : todayVsRecentLabel(
                        windows.today.sold,
                        windows.last_7d.sold
                      )
                }
              />
              <SimpleStat
                label="This week"
                value={`${windows.last_7d.sold.toLocaleString()} sold`}
                accent={windows.last_7d.revenue > 0 ? "success" : undefined}
                subline={
                  windows.last_7d.revenue > 0
                    ? `${fmtMoney(windows.last_7d.revenue, event.currency)} in 7 days`
                    : "no sales in 7 days"
                }
              />
              <SimpleStat
                label="Total"
                value={fmtMoney(totals.revenue, event.currency)}
                accent="success"
                subline={
                  totals.refunded_revenue > 0
                    ? `${totals.sold.toLocaleString()} sold · ${fmtMoney(totals.refunded_revenue, event.currency)} refunded`
                    : `${totals.sold.toLocaleString()} ticket${totals.sold === 1 ? "" : "s"} sold`
                }
              />
            </div>

            {/* ── Sales chart ────────────────────────────────────── */}
            <SalesChartCard
              cumulative={cumulative.values}
              eventDate={new Date(event.date_start)}
              projection={projection}
              currency={event.currency}
              totalSold={totals.sold}
            />

            {/* ── Tickets ────────────────────────────────────────── */}
            {ticketTypes.length > 0 && (
              <TicketsList
                tiers={ticketTypes}
                currency={event.currency}
              />
            )}

            {/* ── Where they came from + Recent buyers ───────────── */}
            <div className="grid gap-3 lg:grid-cols-2">
              <SourcesCard
                sources={sources}
                funnel={funnel}
              />
              <RecentBuyersCard
                orders={recent_orders}
                currency={event.currency}
              />
            </div>

            {/* ── Advanced details (collapsed by default) ────────── */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 self-start font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70",
                "hover:text-foreground transition-colors",
                "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
              )}
              aria-expanded={showAdvanced}
            >
              <ChevronDown
                size={11}
                className={cn(
                  "transition-transform",
                  showAdvanced ? "rotate-0" : "-rotate-90"
                )}
              />
              {showAdvanced ? "Hide details" : "Show advanced details"}
            </button>
            {showAdvanced && (
              <div className="grid gap-3 lg:grid-cols-2">
                <PaymentMethodsCard
                  methods={payment_methods}
                  currency={event.currency}
                />
                <UtmCard sources={sources} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Components
   ────────────────────────────────────────────────────────────────── */

const MOOD_TONE: Record<EventSummaryMood, { ring: string; tint: string; icon: string }> = {
  great: {
    ring: "border-success/30",
    tint: "bg-success/[0.04]",
    icon: "text-success",
  },
  good: {
    ring: "border-primary/25",
    tint: "bg-primary/[0.04]",
    icon: "text-primary",
  },
  neutral: {
    ring: "border-border/40",
    tint: "bg-card/40",
    icon: "text-muted-foreground/70",
  },
  concern: {
    ring: "border-warning/30",
    tint: "bg-warning/[0.04]",
    icon: "text-warning",
  },
  pending: {
    ring: "border-border/40",
    tint: "bg-card/40",
    icon: "text-muted-foreground/70",
  },
  sold_out: {
    ring: "border-success/40",
    tint: "bg-success/[0.06]",
    icon: "text-success",
  },
};

function SmartSummary({
  summary,
  soldOf,
  capacity,
  eventDate,
}: {
  summary: { headline: string; subline: string; mood: EventSummaryMood };
  soldOf: number;
  capacity: number | null;
  eventDate: Date;
}) {
  const tone = MOOD_TONE[summary.mood];
  const pct =
    capacity != null && capacity > 0
      ? Math.min(100, Math.round((soldOf / capacity) * 100))
      : null;
  const daysUntil = Math.max(
    0,
    Math.round((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  const dateText = eventDate.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-5 sm:px-7 sm:py-6 backdrop-blur-sm",
        tone.ring,
        tone.tint
      )}
    >
      <div className="flex items-start gap-3">
        <Sparkles size={16} className={cn("mt-0.5 shrink-0", tone.icon)} />
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-tight text-foreground sm:text-[20px]">
            {summary.headline}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {summary.subline}
          </p>
        </div>
      </div>
      {pct != null && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
              Capacity
            </span>
            <span className="font-mono text-[11px] tabular-nums text-foreground/85">
              {soldOf.toLocaleString()} of {capacity?.toLocaleString()} ·{" "}
              {pct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className={cn(
                "h-full transition-all",
                pct >= 95
                  ? "bg-success"
                  : pct >= 60
                    ? "bg-primary"
                    : "bg-primary/55"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground/85">
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={11} />
          {dateText}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={11} />
          {daysUntil === 0
            ? "Today"
            : daysUntil === 1
              ? "1 day to go"
              : `${daysUntil} days to go`}
        </span>
      </div>
    </div>
  );
}

function SimpleStat({
  label,
  value,
  subline,
  accent,
}: {
  label: string;
  value: string;
  subline: string;
  accent?: "success";
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-mono text-[22px] font-bold leading-none tabular-nums",
          accent === "success" ? "text-success" : "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground/85">{subline}</p>
    </div>
  );
}

function SalesChartCard({
  cumulative,
  eventDate,
  projection,
  totalSold,
}: {
  cumulative: number[];
  eventDate: Date;
  projection: { total: number; eventDate: Date } | null;
  currency: string;
  totalSold: number;
}) {
  const dateText = eventDate.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Sales over time
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
            {totalSold.toLocaleString()} sold so far
          </h3>
        </div>
      </div>
      <div className="mt-4">
        {cumulative.length > 0 && cumulative.some((v) => v > 0) ? (
          <MicroSparkline
            data={cumulative}
            color="#A78BFA"
            width={600}
            height={120}
            variant="area"
            showDot
            className="w-full"
          />
        ) : (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            No sales yet — your chart will appear here once your first
            ticket sells.
          </p>
        )}
      </div>
      {projection && (
        <p className="mt-3 border-t border-border/30 pt-3 text-[12px] text-muted-foreground">
          At this pace you&rsquo;ll reach{" "}
          <span className="font-mono font-semibold text-foreground">
            ~{projection.total.toLocaleString()}
          </span>{" "}
          tickets by{" "}
          <span className="font-mono text-foreground/85">{dateText}</span>.
        </p>
      )}
    </div>
  );
}

/* ── Tickets list ───────────────────────────────────────────────── */

type TierStatusKey =
  | "sold_out"
  | "going_fast"
  | "steady"
  | "slow"
  | "not_started"
  | "paused";

const TIER_STATUS_LABEL: Record<TierStatusKey, string> = {
  sold_out: "Sold out",
  going_fast: "Going fast",
  steady: "Steady",
  slow: "Slow this week",
  not_started: "No sales yet",
  paused: "Paused",
};

const TIER_STATUS_BADGE: Record<TierStatusKey, "success" | "default" | "secondary" | "warning"> = {
  sold_out: "success",
  going_fast: "success",
  steady: "default",
  slow: "warning",
  not_started: "secondary",
  paused: "secondary",
};

const TIER_STATUS_BAR: Record<TierStatusKey, string> = {
  sold_out: "bg-success",
  going_fast: "bg-success/85",
  steady: "bg-primary",
  slow: "bg-warning",
  not_started: "bg-foreground/[0.10]",
  paused: "bg-foreground/[0.10]",
};

function tierStatus(tier: OverviewTicketType): TierStatusKey {
  if (tier.status !== "active") return "paused";
  if (tier.sellthrough_pct != null && tier.sellthrough_pct >= 100)
    return "sold_out";
  if (tier.sold === 0) return "not_started";
  if (tier.sellthrough_pct != null && tier.sellthrough_pct >= 80)
    return "going_fast";
  if (tier.per_day_7d === 0 && tier.sold > 0) return "slow";
  return "steady";
}

function TicketsList({
  tiers,
  currency,
}: {
  tiers: OverviewTicketType[];
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 sm:px-5">
      <div className="mb-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Tickets
        </p>
        <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
          How each tier is selling
        </h3>
      </div>
      <ul className="divide-y divide-border/30">
        {tiers.map((tier) => (
          <TierRow key={tier.id} tier={tier} currency={currency} />
        ))}
      </ul>
    </div>
  );
}

function TierRow({
  tier,
  currency,
}: {
  tier: OverviewTicketType;
  currency: string;
}) {
  const status = tierStatus(tier);
  const pct = tier.sellthrough_pct;
  const capacityKnown = tier.capacity != null;

  return (
    <li className="space-y-2 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[14px] font-medium text-foreground">
            {tier.name}
          </span>
          <Badge variant={TIER_STATUS_BADGE[status]}>
            {TIER_STATUS_LABEL[status]}
          </Badge>
        </div>
        <span className="font-mono text-[12px] tabular-nums text-foreground">
          {tier.sold.toLocaleString()}
          {capacityKnown && (
            <span className="text-muted-foreground">
              {" "}
              of {tier.capacity!.toLocaleString()}
            </span>
          )}
        </span>
      </div>
      {capacityKnown && pct != null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
          <div
            className={cn("h-full transition-all", TIER_STATUS_BAR[status])}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>
          {fmtMoney(tier.revenue_completed, currency)}
          <span className="ml-1.5 text-muted-foreground/60">
            from this tier
          </span>
        </span>
        <span>
          {fmtMoney(tier.price, currency)}{" "}
          <span className="text-muted-foreground/60">per ticket</span>
        </span>
      </div>
    </li>
  );
}

/* ── Sources ────────────────────────────────────────────────────── */

function sourceIcon(referrer: string): { Icon: typeof Instagram; color: string; nice: string } {
  const lower = referrer.toLowerCase();
  if (lower.includes("instagram"))
    return { Icon: Instagram, color: "text-pink-500", nice: "Instagram" };
  if (lower.includes("facebook"))
    return { Icon: Facebook, color: "text-blue-500", nice: "Facebook" };
  if (lower.includes("twitter") || lower.includes("x.com") || lower.includes("t.co"))
    return { Icon: Twitter, color: "text-sky-500", nice: "Twitter / X" };
  if (lower.includes("google"))
    return { Icon: Search, color: "text-amber-500", nice: "Google" };
  if (lower === "direct" || lower === "")
    return { Icon: Link2, color: "text-muted-foreground/70", nice: "Direct link" };
  return { Icon: Globe, color: "text-muted-foreground/70", nice: referrer };
}

function SourcesCard({
  sources,
  funnel,
}: {
  sources: OverviewResponse["sources"];
  funnel: OverviewResponse["funnel"];
}) {
  const top = sources.referrers.slice(0, 5);
  const total = top.reduce((acc, r) => acc + r.count, 0);
  const conversionLine =
    funnel.page_views > 0 && funnel.paid > 0
      ? `${funnel.conversion_pct}% of ${funnel.page_views.toLocaleString()} viewer${funnel.page_views === 1 ? "" : "s"} bought a ticket`
      : funnel.page_views > 0
        ? `${funnel.page_views.toLocaleString()} viewer${funnel.page_views === 1 ? "" : "s"} this month, no purchases yet`
        : null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 sm:px-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        Where buyers found you
      </p>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
        Top sources · last 30 days
      </h3>
      {top.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No traffic data yet — visits to your event page show up here.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {top.map((r) => {
            const { Icon, color, nice } = sourceIcon(r.referrer);
            const pct = total > 0 ? (r.count / total) * 100 : 0;
            return (
              <li key={r.referrer} className="flex items-center gap-3">
                <Icon size={14} className={cn("shrink-0", color)} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
                  {nice}
                </span>
                <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-foreground/[0.04] sm:block">
                  <div
                    className="h-full bg-primary/55"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {r.count.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {conversionLine && (
        <p className="mt-4 border-t border-border/30 pt-3 text-[12px] text-muted-foreground">
          {conversionLine}
        </p>
      )}
    </div>
  );
}

function RecentBuyersCard({
  orders,
  currency,
}: {
  orders: OverviewResponse["recent_orders"];
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Recent buyers
          </p>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
            Last 10 orders
          </h3>
        </div>
        <Link
          href="/admin/orders/"
          className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary hover:underline"
        >
          All orders
          <ExternalLink size={10} />
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No orders yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/30">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-foreground">
                  {o.customer_name}
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

/* ── Advanced disclosure: payment methods + UTM ─────────────────── */

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
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 sm:px-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        Payment methods
      </p>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
        How buyers paid
      </h3>
      {methods.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No completed orders yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {methods.map((m) => {
            const pct = totalRevenue > 0 ? (m.revenue / totalRevenue) * 100 : 0;
            return (
              <li key={m.method} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-foreground/85">
                    {PAYMENT_METHOD_LABEL[m.method] ?? m.method}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-foreground">
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

function UtmCard({ sources }: { sources: OverviewResponse["sources"] }) {
  const utm = sources.utm_sources;
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 sm:px-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        Marketing sources (UTM)
      </p>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
        Where your campaigns came from
      </h3>
      {utm.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No UTM-tagged links yet. Add{" "}
          <code className="font-mono text-[10px]">?utm_source=instagram</code>{" "}
          to a link to track that campaign.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {utm.map((u) => (
            <li
              key={u.utm_source}
              className="flex items-center justify-between gap-3 text-[12px]"
            >
              <span className="text-foreground/85">{u.utm_source}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {u.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
