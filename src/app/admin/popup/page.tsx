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
  timestamp: string;
}

type Period = "today" | "7d" | "30d" | "all";

const POPUP_TYPES = ["impressions", "engaged", "dismissed", "conversions"] as const;

const EVENT_COLORS: Record<string, string> = {
  impressions: "#8B5CF6",
  engaged: "#38BDF8",
  conversions: "#34D399",
  dismissed: "#71717a",
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

/* ═══════════════════════════════════════════════════════════
   GAUGE — circular progress ring via conic-gradient
   ═══════════════════════════════════════════════════════════ */
function Gauge({
  value,
  color,
  label,
  threshold,
}: {
  value: number;
  color: string;
  label: string;
  threshold: { label: string; color: string };
}) {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const gradientDeg = (clampedValue / 100) * 360;

  return (
    <Card className="py-0 gap-0">
      <CardContent className="flex flex-col items-center p-6">
        {/* Ring */}
        <div className="relative h-28 w-28">
          <div
            className="absolute inset-0 rounded-full transition-all duration-700 ease-out"
            style={{
              background: `conic-gradient(${color} ${gradientDeg}deg, rgba(255,255,255,0.06) ${gradientDeg}deg)`,
              mask: "radial-gradient(farthest-side, transparent 70%, #000 71%)",
              WebkitMask: "radial-gradient(farthest-side, transparent 70%, #000 71%)",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {clampedValue.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Label */}
        <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground">
          {label}
        </p>

        {/* Threshold */}
        <span
          className="mt-1.5 text-[10px] font-semibold"
          style={{ color: threshold.color }}
        >
          {threshold.label}
        </span>
      </CardContent>
    </Card>
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

  // Load popup active status
  useEffect(() => {
    fetch(`/api/settings?key=${SETTINGS_KEYS.POPUP}`)
      .then((r) => r.json())
      .then((json) => setPopupActive(json?.data?.enabled ?? false))
      .catch(() => setPopupActive(false));
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

    // Also fetch recent events
    let recentQuery = supabase
      .from(TABLES.POPUP_EVENTS)
      .select("id, event_type, page, timestamp")
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
            setRecentEvents((prev) => [
              {
                id: payload.new.id as string,
                event_type: type,
                page: (payload.new.page as string) || "",
                timestamp: (payload.new.timestamp as string) || new Date().toISOString(),
              },
              ...prev.slice(0, 19),
            ]);
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

        {/* Performance Gauges */}
        <div className="grid gap-4 grid-cols-3">
          <Gauge
            value={engagementRate}
            color="#8B5CF6"
            label="Engagement"
            threshold={getThreshold(engagementRate, "engagement")}
          />
          <Gauge
            value={conversionRate}
            color="#34D399"
            label="Conversion"
            threshold={getThreshold(conversionRate, "conversion")}
          />
          <Gauge
            value={dismissRate}
            color="#71717a"
            label="Dismiss"
            threshold={getThreshold(dismissRate, "dismiss")}
          />
        </div>
      </div>

      {/* Recent Activity Feed */}
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
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/20"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: EVENT_COLORS[event.event_type] || "#71717a" }}
                  />
                  <span className="text-[12px] font-medium capitalize text-foreground w-24 shrink-0">
                    {event.event_type}
                  </span>
                  <span className="flex-1 truncate text-[11px] text-muted-foreground font-mono">
                    {event.page || "—"}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
              ))}
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
