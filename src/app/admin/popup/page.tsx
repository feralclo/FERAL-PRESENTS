"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, SETTINGS_KEYS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  Settings,
  Trash2,
  AlertTriangle,
  Flame,
  Trophy,
  Target,
  Loader2,
} from "lucide-react";

/* ── Types ── */
interface PopupStats {
  impressions: number;
  engaged: number;
  dismissed: number;
  conversions: number;
}

interface RecentEvent {
  id: string;
  event_type: string;
  page: string;
  city?: string | null;
  country?: string | null;
  timestamp: string;
}

interface Lead {
  id: string;
  email: string;
  city: string | null;
  country: string | null;
  timestamp: string;
  event_name: string | null;
  customer: { id: string; total_orders: number; total_spent: number } | null;
}

interface LeadsData {
  leads: Lead[];
  total: number;
  total_captures: number;
  streak: number;
  page: number;
  limit: number;
}

type Period = "today" | "7d" | "30d" | "all";

const POPUP_TYPES = ["impressions", "engaged", "dismissed", "conversions"] as const;

const EVENT_COLORS: Record<string, string> = {
  impressions: "#8B5CF6",
  engaged: "#38BDF8",
  conversions: "#34D399",
  dismissed: "#71717a",
};

const EVENT_ICONS: Record<string, typeof Eye> = {
  impressions: Eye,
  engaged: MousePointerClick,
  conversions: CheckCircle2,
  dismissed: XCircle,
};

/* ── Helpers ── */
function getPeriodStart(period: Period): string | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    now.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    now.setDate(now.getDate() - 7);
  } else if (period === "30d") {
    now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function getThreshold(rate: number, type: "engagement" | "conversion" | "dismiss"): {
  label: string;
  color: string;
} {
  if (type === "dismiss") {
    if (rate < 40) return { label: "Healthy", color: "#34D399" };
    if (rate < 60) return { label: "Normal", color: "#FBBF24" };
    return { label: "High", color: "#F43F5E" };
  }
  if (type === "engagement") {
    if (rate > 30) return { label: "Strong", color: "#34D399" };
    if (rate > 15) return { label: "Moderate", color: "#FBBF24" };
    return { label: "Needs work", color: "#F43F5E" };
  }
  // conversion
  if (rate > 15) return { label: "Excellent", color: "#34D399" };
  if (rate > 5) return { label: "Good", color: "#FBBF24" };
  return { label: "Needs work", color: "#F43F5E" };
}

function getMilestone(count: number): number | null {
  const milestones = [50, 100, 250, 500, 1000, 2500, 5000];
  for (const m of milestones) {
    if (count >= m - 5 && count <= m + 2) return m;
  }
  return null;
}

function resolveEventName(page: string, slugMap: Record<string, string>): string {
  const match = page?.match(/\/event\/([^/]+)/);
  if (!match) return page || "—";
  const slug = match[1];
  if (slugMap[slug]) return slugMap[slug];
  // Fallback: format raw slug as readable text (e.g. "liverpool-27-march" → "Liverpool 27 March")
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ═══════════════════════════════════════════════════════════
   ANIMATED COUNT-UP
   ═══════════════════════════════════════════════════════════ */
function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 800;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // Only animate when value changes, not display
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

/* ═══════════════════════════════════════════════════════════
   PERFORMANCE BAR — clean horizontal stat bar
   ═══════════════════════════════════════════════════════════ */
function PerformanceBar({
  value,
  color,
  label,
  threshold,
  icon: Icon,
}: {
  value: number;
  color: string;
  label: string;
  threshold: { label: string; color: string };
  icon: typeof Eye;
}) {
  const clampedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="flex items-center gap-4">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={14} style={{ color }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {clampedValue.toFixed(1)}%
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ color: threshold.color, backgroundColor: `${threshold.color}15` }}
            >
              {threshold.label}
            </span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-foreground/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(clampedValue, 1)}%`,
              background: `linear-gradient(90deg, ${color}90, ${color})`,
              boxShadow: clampedValue > 5 ? `0 0 8px ${color}40` : "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   POPUP ANALYTICS PAGE
   ═══════════════════════════════════════════════════════════ */
export default function PopupAnalytics() {
  const [stats, setStats] = useState<PopupStats>({
    impressions: 0,
    engaged: 0,
    dismissed: 0,
    conversions: 0,
  });
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [popupActive, setPopupActive] = useState<boolean | null>(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Leads state
  const [leadsData, setLeadsData] = useState<LeadsData | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsPage, setLeadsPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Slug→name map for activity feed
  const [slugMap, setSlugMap] = useState<Record<string, string>>({});

  // Load popup active status
  useEffect(() => {
    fetch(`/api/settings?key=${SETTINGS_KEYS.POPUP}`)
      .then((r) => r.json())
      .then((json) => setPopupActive(json?.data?.enabled ?? false))
      .catch(() => setPopupActive(false));
  }, []);

  // Load slug→name map for activity feed (once on mount)
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          const map: Record<string, string> = {};
          for (const e of json.data) {
            if (e.slug && e.name) map[e.slug] = e.name;
          }
          setSlugMap(map);
        }
      })
      .catch(() => {});
  }, []);

  // Load leads
  const loadLeads = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLeadsLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`/api/popup/leads?page=${page}&limit=20`);
      const json: LeadsData = await res.json();

      if (append && leadsData) {
        setLeadsData({
          ...json,
          leads: [...leadsData.leads, ...json.leads],
        });
      } else {
        setLeadsData(json);
      }
      setLeadsPage(page);
    } catch {
      // Silently fail — leads section shows empty state
    }

    setLeadsLoading(false);
    setLoadingMore(false);
  }, [leadsData]);

  useEffect(() => {
    loadLeads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data loader — runs queries in parallel
  const loadStats = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const periodStart = getPeriodStart(period);

    const queries = POPUP_TYPES.map((type) => {
      let q = supabase
        .from(TABLES.POPUP_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", type);
      if (periodStart) q = q.gte("timestamp", periodStart);
      return q;
    });

    // Also fetch recent events (with new city/country columns)
    let recentQuery = supabase
      .from(TABLES.POPUP_EVENTS)
      .select("id, event_type, page, city, country, timestamp")
      .order("timestamp", { ascending: false })
      .limit(20);
    if (periodStart) recentQuery = recentQuery.gte("timestamp", periodStart);

    const [results, recentResult] = await Promise.all([
      Promise.all(queries),
      recentQuery,
    ]);

    const data: PopupStats = { impressions: 0, engaged: 0, dismissed: 0, conversions: 0 };
    POPUP_TYPES.forEach((type, i) => {
      data[type] = results[i].count || 0;
    });
    setStats(data);

    if (recentResult.data) {
      setRecentEvents(recentResult.data as RecentEvent[]);
    }
  }, [period]);

  // Setup polling + realtime
  useEffect(() => {
    loadStats();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Polling every 15 seconds
    pollRef.current = setInterval(loadStats, 15_000);

    // Realtime — instant incremental updates
    const channel = supabase
      .channel("popup-analytics-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.POPUP_EVENTS },
        (payload) => {
          const type = payload.new.event_type as string;
          if (POPUP_TYPES.includes(type as typeof POPUP_TYPES[number])) {
            setStats((prev) => ({ ...prev, [type]: prev[type as keyof PopupStats] + 1 }));
            // Prepend to recent events
            const newEvent: RecentEvent = {
              id: payload.new.id as string,
              event_type: type,
              page: (payload.new.page as string) || "",
              city: (payload.new.city as string) || null,
              country: (payload.new.country as string) || null,
              timestamp: (payload.new.timestamp as string) || new Date().toISOString(),
            };
            setRecentEvents((prev) => [newEvent, ...prev.slice(0, 19)]);

            // If it's a conversion with email, prepend to leads
            if (type === "conversions" && payload.new.email) {
              const newLead: Lead = {
                id: payload.new.id as string,
                email: payload.new.email as string,
                city: (payload.new.city as string) || null,
                country: (payload.new.country as string) || null,
                timestamp: (payload.new.timestamp as string) || new Date().toISOString(),
                event_name: null, // Will be resolved from slug map on render
                customer: null,
              };
              setLeadsData((prev) => {
                if (!prev) return {
                  leads: [newLead],
                  total: 1,
                  total_captures: 1,
                  streak: 0,
                  page: 1,
                  limit: 20,
                };
                return {
                  ...prev,
                  leads: [newLead, ...prev.leads],
                  total: prev.total + 1,
                  total_captures: prev.total_captures + 1,
                };
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  // Reset analytics
  const handleReset = async () => {
    if (resetConfirm !== "RESET") return;
    setResetting(true);

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from(TABLES.POPUP_EVENTS).delete().neq("id", 0);
    }

    setStats({ impressions: 0, engaged: 0, dismissed: 0, conversions: 0 });
    setRecentEvents([]);
    setLeadsData(null);
    setResetConfirm("");
    setResetting(false);
  };

  // Derived rates
  const engagementRate = stats.impressions > 0 ? (stats.engaged / stats.impressions) * 100 : 0;
  const conversionRate = stats.impressions > 0 ? (stats.conversions / stats.impressions) * 100 : 0;
  const dismissRate = stats.impressions > 0 ? (stats.dismissed / stats.impressions) * 100 : 0;

  const FUNNEL_STAGES = [
    { label: "Impressions", count: stats.impressions },
    { label: "Engaged", count: stats.engaged },
    { label: "Converted", count: stats.conversions },
  ];

  const PERIODS: { value: Period; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
    { value: "all", label: "All Time" },
  ];

  const milestone = leadsData ? getMilestone(leadsData.total_captures) : null;
  const hasMore = leadsData ? leadsData.leads.length < leadsData.total : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
              Popup Analytics
            </h1>
            {popupActive !== null && (
              popupActive ? (
                <Badge variant="success" className="gap-1.5 text-[9px] font-bold uppercase">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px] font-bold uppercase">
                  Inactive
                </Badge>
              )
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time popup engagement analytics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Edit Popup button */}
          <Link href="/admin/communications/marketing/popup/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings size={13} />
              Edit Popup
            </Button>
          </Link>

          {/* Period selector */}
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`rounded-md px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                  period === p.value
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Impressions"
          value={String(stats.impressions)}
          icon={Eye}
        />
        <StatCard
          label="Engaged"
          value={String(stats.engaged)}
          icon={MousePointerClick}
          detail={`${engagementRate.toFixed(1)}% rate`}
        />
        <StatCard
          label="Conversions"
          value={String(stats.conversions)}
          icon={CheckCircle2}
          detail={`${conversionRate.toFixed(1)}% rate`}
        />
        <StatCard
          label="Dismissed"
          value={String(stats.dismissed)}
          icon={XCircle}
          detail={`${dismissRate.toFixed(1)}% rate`}
        />
      </div>

      {/* ★ Captured Leads Section */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm">Captured Leads</CardTitle>
              {leadsData && (
                <span className="font-mono text-lg font-bold tabular-nums text-primary">
                  <AnimatedCounter value={leadsData.total_captures} />
                </span>
              )}
              {leadsData && leadsData.streak >= 2 && (
                <Badge variant="warning" className="gap-1 text-[10px] font-bold">
                  <Flame size={11} />
                  {leadsData.streak} day streak
                </Badge>
              )}
              {milestone && (
                <Badge className="gap-1 text-[10px] font-bold bg-warning/10 text-warning border-warning/20">
                  <Trophy size={11} />
                  {milestone}th capture!
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {leadsLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <p className="mt-2 text-xs text-muted-foreground">Loading leads...</p>
            </div>
          ) : !leadsData || leadsData.leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Target size={24} className="text-muted-foreground/20" />
              <p className="mt-2 text-xs text-muted-foreground">No captures yet</p>
              <p className="mt-1 text-[10px] text-muted-foreground/60">
                Popup conversions with emails will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {leadsData.leads.map((lead, i) => {
                  const isNew = isToday(lead.timestamp);
                  const isFirst = i === 0;
                  // Resolve event name from slugMap if not provided by API
                  const eventName = lead.event_name || (lead.email && resolveEventName(
                    // Extract page from the lead's context — for realtime leads we don't have page
                    "", slugMap
                  )) || null;
                  const flag = countryFlag(lead.country);
                  const initials = lead.email.slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={lead.id}
                      className={`flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/20 ${
                        isFirst ? "border-l-2 border-l-primary animate-pulse" : ""
                      }`}
                    >
                      {/* Avatar */}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-bold text-primary">
                        {initials}
                      </span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {lead.email}
                          </span>
                          {isNew && (
                            <Badge variant="success" className="text-[9px] font-bold px-1.5 py-0">
                              New!
                            </Badge>
                          )}
                          {lead.customer && lead.customer.total_orders > 0 && (
                            <Link
                              href={`/admin/customers/${lead.customer.id}/`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                variant={lead.customer.total_orders >= 5 ? "warning" : "secondary"}
                                className="text-[9px] font-bold cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                {lead.customer.total_orders} order{lead.customer.total_orders !== 1 ? "s" : ""}
                              </Badge>
                            </Link>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {eventName && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {eventName}
                            </span>
                          )}
                          {(lead.city || lead.country) && (
                            <span className="text-[11px] text-muted-foreground/60">
                              {eventName ? "·" : ""} {flag} {lead.city || ""}{lead.city && lead.country ? ", " : ""}{lead.country || ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                        {timeAgo(lead.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center py-4 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadLeads(leadsPage + 1, true)}
                    disabled={loadingMore}
                    className="gap-1.5 text-xs"
                  >
                    {loadingMore ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Funnel + Gauges */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-6 pt-5 pb-4">
            <CardTitle className="text-sm">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="flex items-end gap-4 h-[200px]">
              {FUNNEL_STAGES.map((stage, i) => {
                const pct = stats.impressions > 0 ? (stage.count / stats.impressions) * 100 : 0;
                return (
                  <div key={stage.label} className="flex flex-1 flex-col items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-foreground font-medium">
                      {stage.count}
                    </span>
                    <div className="w-full flex flex-col justify-end h-[140px]">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-primary/80 to-primary/40 transition-all duration-700 ease-out"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground text-center uppercase">
                      {stage.label}
                    </span>
                    {i > 0 && (
                      <span className="text-[10px] tabular-nums text-muted-foreground/60">
                        {pct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Performance */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-6 pt-5 pb-4">
            <CardTitle className="text-sm">Performance</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-5">
            <PerformanceBar
              value={engagementRate}
              color="#8B5CF6"
              label="Engagement"
              icon={MousePointerClick}
              threshold={getThreshold(engagementRate, "engagement")}
            />
            <PerformanceBar
              value={conversionRate}
              color="#34D399"
              label="Conversion"
              icon={CheckCircle2}
              threshold={getThreshold(conversionRate, "conversion")}
            />
            <PerformanceBar
              value={dismissRate}
              color="#71717a"
              label="Dismiss"
              icon={XCircle}
              threshold={getThreshold(dismissRate, "dismiss")}
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Feed — Enhanced */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Eye size={24} className="text-muted-foreground/20" />
              <p className="mt-2 text-xs text-muted-foreground">
                No popup events {period !== "all" ? "in this period" : "yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentEvents.map((event) => {
                const IconComponent = EVENT_ICONS[event.event_type] || Eye;
                const color = EVENT_COLORS[event.event_type] || "#71717a";
                const eventName = resolveEventName(event.page, slugMap);
                const flag = countryFlag(event.country || null);

                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/20"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <IconComponent size={12} style={{ color }} />
                    </span>
                    <span
                      className="text-[12px] font-medium capitalize w-24 shrink-0"
                      style={{ color }}
                    >
                      {event.event_type}
                    </span>
                    <span className="flex-1 truncate text-[11px] text-muted-foreground">
                      {eventName}
                    </span>
                    {(event.city || event.country) && (
                      <span className="shrink-0 text-[11px] text-muted-foreground/60">
                        {flag} {event.city || event.country || ""}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                      {timeAgo(event.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reset Analytics */}
      <Card className="py-0 gap-0 border-dashed">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Reset Analytics</p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Permanently delete all popup event data. Type <span className="font-mono font-bold text-foreground">RESET</span> to confirm.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28 font-mono text-xs"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value.toUpperCase())}
                placeholder="RESET"
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={resetConfirm !== "RESET" || resetting}
                onClick={handleReset}
                className="gap-1.5"
              >
                {resetting ? (
                  <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                ) : (
                  <Trash2 size={12} />
                )}
                Reset Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
