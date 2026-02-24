"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Loader2,
  RefreshCw,
  Zap,
  CreditCard,
  Activity,
} from "lucide-react";

interface PaymentHealthData {
  summary: { total_events: number; critical_count: number; warning_count: number; unresolved_count: number };
  payments: { succeeded: number; failed: number; failure_rate: number; total_amount_failed_pence: number };
  checkout: { errors: number; validations: number; rate_limit_blocks: number };
  connect: {
    total_accounts: number; healthy: number; unhealthy: number; fallbacks: number;
    unhealthy_list: { org_id: string; stripe_account_id: string; error_message: string; created_at: string }[];
  };
  webhooks: { received: number; errors: number; error_rate: number };
  recent_critical: {
    id: string; org_id: string; type: string; severity: string; error_code: string | null;
    error_message: string | null; stripe_account_id: string | null; customer_email: string | null;
    resolved: boolean; created_at: string;
  }[];
  failure_by_org: { org_id: string; succeeded: number; failed: number; failure_rate: number }[];
  failure_by_code: { code: string; count: number }[];
  hourly_trend: { hour: string; succeeded: number; failed: number; errors: number }[];
}

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPence(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(1)}k`;
  return pounds % 1 === 0 ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

function StatusBanner({ data }: { data: PaymentHealthData }) {
  const { critical_count, unresolved_count } = data.summary;
  const failureRate = data.payments.failure_rate;

  if (critical_count > 0 || unresolved_count > 5 || failureRate > 0.1) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4">
        <XCircle size={20} className="text-destructive shrink-0" />
        <div>
          <p className="text-sm font-semibold text-destructive">Issues Detected</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {critical_count} critical issue{critical_count !== 1 ? "s" : ""}, {unresolved_count} unresolved,{" "}
            {(failureRate * 100).toFixed(1)}% failure rate
          </p>
        </div>
      </div>
    );
  }

  if (data.summary.warning_count > 0 || failureRate > 0.05) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-5 py-4">
        <AlertTriangle size={20} className="text-warning shrink-0" />
        <div>
          <p className="text-sm font-semibold text-warning">Warnings Present</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.summary.warning_count} warning{data.summary.warning_count !== 1 ? "s" : ""},{" "}
            {(failureRate * 100).toFixed(1)}% failure rate
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-5 py-4">
      <CheckCircle2 size={20} className="text-success shrink-0" />
      <div>
        <p className="text-sm font-semibold text-success">All Systems Healthy</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No critical issues. {data.payments.succeeded} successful payment{data.payments.succeeded !== 1 ? "s" : ""} in period.
        </p>
      </div>
    </div>
  );
}

function HourlyChart({ trend }: { trend: PaymentHealthData["hourly_trend"] }) {
  if (trend.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
        No data in this period
      </div>
    );
  }

  const maxVal = Math.max(...trend.map((b) => b.succeeded + b.failed + b.errors), 1);

  return (
    <div className="flex items-end gap-[2px] h-40 px-1">
      {trend.map((bucket) => {
        const total = bucket.succeeded + bucket.failed + bucket.errors;
        const height = (total / maxVal) * 100;
        const successPct = total > 0 ? (bucket.succeeded / total) * 100 : 100;
        const failPct = total > 0 ? (bucket.failed / total) * 100 : 0;
        const label = bucket.hour.slice(11, 16);

        return (
          <div key={bucket.hour} className="flex flex-col items-center flex-1 min-w-0" title={`${label}: ${bucket.succeeded}ok / ${bucket.failed}fail / ${bucket.errors}err`}>
            <div
              className="w-full rounded-t-sm overflow-hidden"
              style={{ height: `${Math.max(height, 2)}%` }}
            >
              <div className="flex flex-col h-full w-full">
                {failPct > 0 && (
                  <div className="bg-destructive/80 w-full" style={{ height: `${failPct}%` }} />
                )}
                <div className="bg-success/60 w-full flex-1" style={{ height: `${successPct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PaymentHealthPage() {
  const [data, setData] = useState<PaymentHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/payment-health?period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 30_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  async function resolveEvent(id: string) {
    setResolving((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/platform/payment-health/${id}/resolve`, { method: "POST" });
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            recent_critical: prev.recent_critical.map((e) =>
              e.id === id ? { ...e, resolved: true } : e
            ),
            summary: { ...prev.summary, unresolved_count: Math.max(0, prev.summary.unresolved_count - 1) },
          };
        });
      }
    } catch {
      // silently fail
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <XCircle size={24} className="text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Payment Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time payment monitoring and alerting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NativeSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-40"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </NativeSelect>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="text-xs gap-1.5"
          >
            <Activity size={12} />
            {autoRefresh ? "Live" : "Auto"}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={fetchData}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Status banner */}
      <StatusBanner data={data} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Failure Rate"
          value={`${(data.payments.failure_rate * 100).toFixed(1)}%`}
          icon={CreditCard}
          detail={`${data.payments.failed} of ${data.payments.succeeded + data.payments.failed} payments`}
        />
        <StatCard
          label="Critical Issues"
          value={String(data.summary.critical_count)}
          icon={AlertTriangle}
          detail={`${data.summary.unresolved_count} unresolved`}
        />
        <StatCard
          label="Connect Health"
          value={`${data.connect.healthy}/${data.connect.total_accounts}`}
          icon={Zap}
          detail={data.connect.unhealthy > 0 ? `${data.connect.unhealthy} unhealthy` : "All healthy"}
        />
        <StatCard
          label="Checkout Errors"
          value={String(data.checkout.errors)}
          icon={Shield}
          detail={`${data.checkout.rate_limit_blocks} rate limited`}
        />
      </div>

      {/* Hourly trend */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Payment Volume
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <HourlyChart trend={data.hourly_trend} />
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success/60" /> Succeeded</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive/80" /> Failed</span>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: Failure by code / Failure by org */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Failure by decline code */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Decline Codes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {data.failure_by_code.length === 0 ? (
              <p className="text-xs text-muted-foreground">No failures in period</p>
            ) : (
              <div className="space-y-2">
                {data.failure_by_code.slice(0, 8).map((item) => (
                  <div key={item.code} className="flex items-center justify-between text-sm">
                    <code className="text-xs font-mono text-muted-foreground">{item.code}</code>
                    <Badge variant="outline" className="text-xs">{item.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failure by tenant */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Failures by Tenant
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {data.failure_by_org.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payment data in period</p>
            ) : (
              <div className="space-y-2">
                {data.failure_by_org.slice(0, 8).map((item) => (
                  <div key={item.org_id} className="flex items-center justify-between text-sm">
                    <span className="text-xs font-mono text-muted-foreground truncate mr-3">{item.org_id}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {item.failed}/{item.succeeded + item.failed}
                      </span>
                      <Badge
                        variant={item.failure_rate > 0.2 ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {(item.failure_rate * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unhealthy Connect accounts */}
      {data.connect.unhealthy_list.length > 0 && (
        <Card className="py-0 gap-0 border-destructive/30">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-destructive">
              Unhealthy Connect Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-3">
              {data.connect.unhealthy_list.map((account, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm border-b border-border/30 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <code className="text-xs font-mono text-foreground">{account.stripe_account_id}</code>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Org: {account.org_id}</p>
                    <p className="text-[11px] text-destructive/80 mt-0.5">{account.error_message}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(account.created_at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent critical events */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Recent Critical Events
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {data.recent_critical.length === 0 ? (
            <p className="text-xs text-muted-foreground">No critical events in period</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.recent_critical.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={event.severity === "critical" ? "destructive" : "outline"}
                        className="text-[10px]"
                      >
                        {event.severity}
                      </Badge>
                      <code className="text-xs font-mono text-foreground">{event.type}</code>
                      {event.resolved && (
                        <Badge variant="outline" className="text-[10px] text-success border-success/30">resolved</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                      <span>Org: {event.org_id}</span>
                      {event.error_code && <span>Code: {event.error_code}</span>}
                      {event.customer_email && <span>{event.customer_email}</span>}
                    </div>
                    {event.error_message && (
                      <p className="text-[11px] text-muted-foreground/70 mt-1 truncate">{event.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(event.created_at)}</span>
                    {!event.resolved && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-6 px-2"
                        disabled={resolving.has(event.id)}
                        onClick={() => resolveEvent(event.id)}
                      >
                        {resolving.has(event.id) ? <Loader2 size={10} className="animate-spin" /> : "Resolve"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
