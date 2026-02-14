"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Eye,
  MousePointerClick,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface PopupStats {
  impressions: number;
  engaged: number;
  dismissed: number;
  conversions: number;
}

const POPUP_TYPES = ["impressions", "engaged", "dismissed", "conversions"] as const;

export default function PopupPerformance() {
  const [stats, setStats] = useState<PopupStats>({
    impressions: 0,
    engaged: 0,
    dismissed: 0,
    conversions: 0,
  });

  // Data loader — runs queries in parallel, used for initial load + polling
  const loadStats = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const queries = POPUP_TYPES.map((type) =>
      supabase
        .from(TABLES.POPUP_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", type)
    );

    const results = await Promise.all(queries);
    const data: PopupStats = { impressions: 0, engaged: 0, dismissed: 0, conversions: 0 };
    POPUP_TYPES.forEach((type, i) => {
      data[type] = results[i].count || 0;
    });
    setStats(data);
  }, []);

  useEffect(() => {
    loadStats();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Polling every 15 seconds — guarantees live data regardless of WebSocket state
    const pollInterval = setInterval(loadStats, 15_000);

    // Realtime — instant incremental updates between polls
    const channel = supabase
      .channel("popup-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.POPUP_EVENTS },
        (payload) => {
          const type = payload.new.event_type as string;
          if (POPUP_TYPES.includes(type as typeof POPUP_TYPES[number])) {
            setStats((prev) => ({ ...prev, [type]: prev[type as keyof PopupStats] + 1 }));
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Entry] Popup realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Entry] Popup realtime issue:", status);
        }
      });

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  const engagementRate =
    stats.impressions > 0
      ? ((stats.engaged / stats.impressions) * 100).toFixed(1)
      : "0";
  const conversionRate =
    stats.impressions > 0
      ? ((stats.conversions / stats.impressions) * 100).toFixed(1)
      : "0";
  const dismissRate =
    stats.impressions > 0
      ? ((stats.dismissed / stats.impressions) * 100).toFixed(1)
      : "0";

  const FUNNEL_STAGES = [
    { label: "Impressions", count: stats.impressions },
    { label: "Engaged", count: stats.engaged },
    { label: "Converted", count: stats.conversions },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Popup Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time popup engagement analytics
        </p>
      </div>

      {/* Stats */}
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
          detail={`${engagementRate}% engagement rate`}
        />
        <StatCard
          label="Conversions"
          value={String(stats.conversions)}
          icon={CheckCircle2}
          detail={`${conversionRate}% conversion rate`}
        />
        <StatCard
          label="Dismissed"
          value={String(stats.dismissed)}
          icon={XCircle}
          detail={`${dismissRate}% dismiss rate`}
        />
      </div>

      {/* Funnel */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Popup Funnel</CardTitle>
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

      {/* Rates */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-0">
          <CardTitle className="text-sm">Performance Rates</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Engagement Rate</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{engagementRate}%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Conversion Rate</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{conversionRate}%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Dismiss Rate</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{dismissRate}%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
