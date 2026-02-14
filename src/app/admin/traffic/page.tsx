"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
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
  Ticket,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
} from "lucide-react";

interface FunnelStats {
  landing: number;
  tickets: number;
  checkout: number;
  purchase: number;
  add_to_cart: number;
}

const FUNNEL_TYPES = ["landing", "tickets", "checkout", "purchase", "add_to_cart"] as const;

export default function TrafficAnalytics() {
  const [funnel, setFunnel] = useState<FunnelStats>({
    landing: 0,
    tickets: 0,
    checkout: 0,
    purchase: 0,
    add_to_cart: 0,
  });

  // Data loader — runs queries in parallel, used for initial load + polling
  const loadFunnel = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const queries = FUNNEL_TYPES.map((type) =>
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", type)
    );

    const results = await Promise.all(queries);
    const data: FunnelStats = { landing: 0, tickets: 0, checkout: 0, purchase: 0, add_to_cart: 0 };
    FUNNEL_TYPES.forEach((type, i) => {
      data[type] = results[i].count || 0;
    });
    setFunnel(data);
  }, []);

  useEffect(() => {
    loadFunnel();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Polling every 15 seconds — guarantees live data regardless of WebSocket state
    const pollInterval = setInterval(loadFunnel, 15_000);

    // Realtime — instant incremental updates between polls
    const channel = supabase
      .channel("traffic-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.TRAFFIC_EVENTS },
        (payload) => {
          const type = payload.new.event_type as string;
          if (FUNNEL_TYPES.includes(type as typeof FUNNEL_TYPES[number])) {
            setFunnel((prev) => ({ ...prev, [type]: prev[type as keyof FunnelStats] + 1 }));
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Entry] Traffic realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Entry] Traffic realtime issue:", status);
        }
      });

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [loadFunnel]);

  const dropoff = (from: number, to: number) =>
    from > 0 ? (((from - to) / from) * 100).toFixed(1) + "%" : "—";

  const dropoffValue = (from: number, to: number) =>
    from > 0 ? ((from - to) / from) * 100 : 0;

  const conversionRate =
    funnel.landing > 0
      ? ((funnel.purchase / funnel.landing) * 100).toFixed(1)
      : "0";

  const FUNNEL_STAGES = [
    { label: "Landing", count: funnel.landing },
    { label: "Tickets", count: funnel.tickets },
    { label: "Add to Cart", count: funnel.add_to_cart },
    { label: "Checkout", count: funnel.checkout },
    { label: "Purchase", count: funnel.purchase },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Traffic Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time conversion funnel &middot; {conversionRate}% overall conversion
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Landing Views" value={String(funnel.landing)} icon={Eye} size="compact" />
        <StatCard label="Ticket Views" value={String(funnel.tickets)} icon={Ticket} size="compact" />
        <StatCard label="Add to Cart" value={String(funnel.add_to_cart)} icon={ShoppingCart} size="compact" />
        <StatCard label="Checkouts" value={String(funnel.checkout)} icon={CreditCard} size="compact" />
        <StatCard label="Purchases" value={String(funnel.purchase)} icon={CheckCircle2} size="compact" />
      </div>

      {/* Conversion Funnel */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="flex items-end gap-3 h-[200px]">
            {FUNNEL_STAGES.map((stage, i) => {
              const pct = funnel.landing > 0 ? (stage.count / funnel.landing) * 100 : 0;
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

      {/* Drop-off Rates */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-0">
          <CardTitle className="text-sm">Drop-off Rates</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Drop-off</TableHead>
              <TableHead className="text-right">Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Landing → Tickets</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{funnel.tickets}</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {dropoff(funnel.landing, funnel.tickets)}
              </TableCell>
              <TableCell className="text-right">
                <DropoffBadge value={dropoffValue(funnel.landing, funnel.tickets)} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Tickets → Checkout</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{funnel.checkout}</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {dropoff(funnel.tickets, funnel.checkout)}
              </TableCell>
              <TableCell className="text-right">
                <DropoffBadge value={dropoffValue(funnel.tickets, funnel.checkout)} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Checkout → Purchase</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{funnel.purchase}</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {dropoff(funnel.checkout, funnel.purchase)}
              </TableCell>
              <TableCell className="text-right">
                <DropoffBadge value={dropoffValue(funnel.checkout, funnel.purchase)} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function DropoffBadge({ value }: { value: number }) {
  if (value === 0) return <Badge variant="secondary">—</Badge>;
  if (value < 20) return <Badge variant="success">Low</Badge>;
  if (value < 50) return <Badge variant="warning">Medium</Badge>;
  return <Badge variant="destructive">High</Badge>;
}
