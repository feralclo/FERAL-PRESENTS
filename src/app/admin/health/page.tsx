"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  latency?: number;
  detail?: string;
}

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  checks: HealthCheck[];
}

const STATUS_CONFIG = {
  ok: { label: "Operational", icon: CheckCircle2, variant: "success" as const },
  degraded: { label: "Degraded", icon: AlertTriangle, variant: "warning" as const },
  down: { label: "Down", icon: XCircle, variant: "destructive" as const },
} as const;

export { SystemHealth as AdminHealth };

export default function SystemHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthResponse = await res.json();
      setHealth(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overallConfig = health ? STATUS_CONFIG[health.status] : null;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Service status and latency monitoring
            {lastRefresh && (
              <span className="ml-2 text-muted-foreground/60">
                &middot; Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Checking..." : "Refresh"}
        </Button>
      </div>

      {/* Overall status banner */}
      {overallConfig && (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center gap-3 p-5">
            <div className="relative flex h-3 w-3">
              {health?.status !== "ok" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
              )}
              <Badge variant={overallConfig.variant} className="h-3 w-3 rounded-full p-0" />
            </div>
            <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
              All Systems {overallConfig.label}
            </span>
            <overallConfig.icon size={16} className={
              health?.status === "ok"
                ? "text-success"
                : health?.status === "degraded"
                  ? "text-warning"
                  : "text-destructive"
            } />
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="py-0 gap-0 border-destructive/30">
          <CardContent className="p-5">
            <p className="text-sm text-destructive">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Service status cards */}
      {health && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {health.checks.map((check) => {
            const config = STATUS_CONFIG[check.status];
            const StatusIcon = config.icon;
            return (
              <Card key={check.name} className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {check.name}
                    </span>
                    <Badge variant={config.variant} className="gap-1">
                      <StatusIcon size={11} />
                      {config.label}
                    </Badge>
                  </div>

                  {check.latency !== undefined && (
                    <div className="mb-2">
                      <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
                        {check.latency}
                      </span>
                      <span className="ml-1 font-mono text-sm text-muted-foreground">ms</span>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            check.latency < 100
                              ? "bg-success"
                              : check.latency < 300
                                ? "bg-warning"
                                : "bg-destructive"
                          }`}
                          style={{ width: `${Math.min((check.latency / 500) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {check.detail && (
                    <p className="text-[11px] text-muted-foreground/70 break-all leading-relaxed">
                      {check.detail}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Platform info */}
      {health && (
        <Card className="py-0 gap-0">
          <CardHeader className="px-6 pt-5 pb-0">
            <CardTitle className="text-sm">Platform Info</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              <InfoRow label="Framework" value="Next.js 16 (App Router)" />
              <InfoRow label="Database" value="Supabase (PostgreSQL)" />
              <InfoRow label="Payments" value="Stripe" />
              <InfoRow label="Hosting" value="Vercel" />
              <InfoRow label="Test Framework" value="Vitest + Testing Library" />
              <InfoRow label="Last Health Check" value={health.timestamp} />
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <TableRow>
      <TableCell className="w-[40%] font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </TableCell>
      <TableCell className="text-sm text-foreground">{value}</TableCell>
    </TableRow>
  );
}
