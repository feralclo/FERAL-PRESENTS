"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Brain,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ExternalLink,
  Monitor,
  Server,
  CreditCard,
  Wrench,
  Bug,
  Globe,
  Activity,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

interface PlatformHealthData {
  status: "healthy" | "warning" | "critical";
  period: string;
  timestamp: string;
  sentry: {
    connected: boolean;
    total_issues: number;
    total_events: number;
    issues_by_level: Record<string, number>;
    issues: SentryIssue[];
  };
  system: {
    overall: "ok" | "degraded" | "down";
    checks: Array<{
      name: string;
      status: "ok" | "degraded" | "down";
      latency: number;
      detail?: string;
    }>;
  };
  payments: {
    succeeded: number;
    failed: number;
    failure_rate: number;
    unresolved_critical: number;
    orphaned: number;
    total_failed_pence: number;
  };
}

interface SentryIssue {
  id: string;
  title: string;
  short_id: string;
  count: number;
  user_count: number;
  level: string;
  first_seen: string;
  last_seen: string;
  type: string;
  value: string;
  filename: string;
  function_name: string;
  tags: Record<string, string>;
}

interface PlatformDigestData {
  generated_at: string;
  period_hours: number;
  summary: string;
  risk_level: "healthy" | "watch" | "concern" | "critical";
  areas: Array<{
    name: string;
    status: "healthy" | "watch" | "concern" | "critical";
    summary: string;
  }>;
  findings: Array<{
    title: string;
    detail: string;
    severity: "info" | "watch" | "concern" | "critical";
    area: string;
  }>;
  recommendations: string[];
  raw_data: Record<string, unknown>;
}

// ─── Constants ───────────────────────────────────────────────────────

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
];

const PERIOD_TO_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
};

const STATUS_CONFIG = {
  healthy: {
    label: "All Systems Healthy",
    icon: CheckCircle2,
    bg: "bg-success/10",
    border: "border-success/30",
    text: "text-success",
    dot: "bg-success",
  },
  warning: {
    label: "Issues Detected",
    icon: AlertTriangle,
    bg: "bg-warning/10",
    border: "border-warning/30",
    text: "text-warning",
    dot: "bg-warning",
  },
  critical: {
    label: "Action Required",
    icon: XCircle,
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    text: "text-destructive",
    dot: "bg-destructive",
  },
};

const AREA_ICONS: Record<string, typeof Monitor> = {
  Frontend: Monitor,
  Backend: Server,
  Payments: CreditCard,
  Infrastructure: Wrench,
};

const RISK_COLORS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  healthy: { border: "border-success/30", bg: "bg-success/5", text: "text-success", dot: "bg-success" },
  watch: { border: "border-info/30", bg: "bg-info/5", text: "text-info", dot: "bg-info" },
  concern: { border: "border-warning/30", bg: "bg-warning/5", text: "text-warning", dot: "bg-warning" },
  critical: { border: "border-destructive/30", bg: "bg-destructive/5", text: "text-destructive", dot: "bg-destructive" },
};

const FINDING_COLORS: Record<string, string> = {
  info: "border-l-info/60",
  watch: "border-l-info/60",
  concern: "border-l-warning/60",
  critical: "border-l-destructive/60",
};

const AREA_BADGE_MAP: Record<string, string> = {
  frontend: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  backend: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  payments: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  infrastructure: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ─── Helpers ─────────────────────────────────────────────────────────

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

function sentryIssueUrl(issueId: string): string {
  const org = "entry-04";
  return `https://${org}.sentry.io/issues/${issueId}/`;
}

// ─── Main Component ──────────────────────────────────────────────────

export default function PlatformHealthPage() {
  const [data, setData] = useState<PlatformHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("24h");

  const fetchData = useCallback(async (p: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/platform/platform-health?period=${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
    // Auto-refresh every 60s
    const interval = setInterval(() => fetchData(period), 60_000);
    return () => clearInterval(interval);
  }, [period, fetchData]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Platform Health
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Whole-platform monitoring — frontend, backend, payments, all tenants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-36 text-xs"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(period)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="py-0 gap-0 border-destructive/30">
          <CardContent className="flex items-center gap-3 p-5">
            <XCircle size={16} className="text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => fetchData(period)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          {/* Traffic Light Status Banner */}
          <StatusBanner data={data} />

          {/* Quick Stats Grid */}
          <QuickStats data={data} />

          {/* AI Platform Digest */}
          <PlatformDigestCard period={period} />

          {/* Service Health */}
          <ServiceHealth data={data} />

          {/* Sentry Issues (the main attraction for frontend/backend errors) */}
          <SentryIssuesSection data={data} />
        </>
      )}
    </div>
  );
}

// ─── Status Banner ──────────────────────────────────────────────────

function StatusBanner({ data }: { data: PlatformHealthData }) {
  const config = STATUS_CONFIG[data.status];
  const Icon = config.icon;

  const details: string[] = [];
  if (data.system.overall === "down") details.push("Core services are down");
  if (data.system.overall === "degraded") details.push("Some services are degraded");
  if (data.payments.orphaned > 0) details.push(`${data.payments.orphaned} orphaned payment${data.payments.orphaned !== 1 ? "s" : ""}`);
  if (data.payments.unresolved_critical > 0) details.push(`${data.payments.unresolved_critical} unresolved critical payment issue${data.payments.unresolved_critical !== 1 ? "s" : ""}`);
  if (data.sentry.total_issues > 0) details.push(`${data.sentry.total_issues} unresolved error${data.sentry.total_issues !== 1 ? "s" : ""} in Sentry`);
  if (data.payments.failure_rate > 0.1) details.push(`${(data.payments.failure_rate * 100).toFixed(1)}% payment failure rate`);

  return (
    <div className={`flex items-start gap-3 rounded-xl border ${config.border} ${config.bg} px-5 py-4`}>
      <Icon size={20} className={`${config.text} shrink-0 mt-0.5`} />
      <div className="flex-1">
        <p className={`text-sm font-semibold ${config.text}`}>{config.label}</p>
        {details.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {details.map((d, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowRight size={10} className={`${config.text} shrink-0`} />
                {d}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            All services operational. No errors detected across the platform.
          </p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/50 shrink-0">
        {new Date(data.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

// ─── Quick Stats Grid ───────────────────────────────────────────────

function QuickStats({ data }: { data: PlatformHealthData }) {
  const totalPayments = data.payments.succeeded + data.payments.failed;

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <StatBox
        label="Platform Errors"
        value={data.sentry.total_issues}
        subtext={data.sentry.connected ? `${data.sentry.total_events} events` : "Sentry not connected"}
        status={
          !data.sentry.connected ? "muted" :
          data.sentry.total_issues === 0 ? "success" :
          (data.sentry.issues_by_level?.error || 0) >= 3 ? "destructive" : "warning"
        }
      />
      <StatBox
        label="Services"
        value={data.system.overall === "ok" ? "Online" : data.system.overall === "degraded" ? "Degraded" : "Down"}
        subtext={`${data.system.checks.filter((c) => c.status === "ok").length}/${data.system.checks.length} healthy`}
        status={data.system.overall === "ok" ? "success" : data.system.overall === "degraded" ? "warning" : "destructive"}
      />
      <StatBox
        label="Payments"
        value={totalPayments > 0 ? `${(((totalPayments - data.payments.failed) / totalPayments) * 100).toFixed(1)}%` : "—"}
        subtext={totalPayments > 0 ? `${data.payments.succeeded} ok, ${data.payments.failed} failed` : "No payments"}
        status={
          totalPayments === 0 ? "muted" :
          data.payments.failure_rate > 0.1 ? "destructive" :
          data.payments.failure_rate > 0.05 ? "warning" : "success"
        }
      />
      <StatBox
        label="Critical Issues"
        value={data.payments.unresolved_critical + data.payments.orphaned}
        subtext={
          data.payments.orphaned > 0
            ? `${data.payments.orphaned} orphaned`
            : data.payments.unresolved_critical > 0
              ? "Needs attention"
              : "All clear"
        }
        status={
          data.payments.orphaned > 0 ? "destructive" :
          data.payments.unresolved_critical > 0 ? "destructive" : "success"
        }
      />
    </div>
  );
}

function StatBox({
  label,
  value,
  subtext,
  status,
}: {
  label: string;
  value: string | number;
  subtext: string;
  status: "success" | "warning" | "destructive" | "muted";
}) {
  const dotColor = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground/30",
  }[status];

  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">{subtext}</p>
      </CardContent>
    </Card>
  );
}

// ─── AI Platform Digest ─────────────────────────────────────────────

function PlatformDigestCard({ period }: { period: string }) {
  const [digest, setDigest] = useState<PlatformDigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(6);

  useEffect(() => {
    fetch("/api/platform/platform-digest")
      .then((r) => r.json())
      .then((data) => setDigest(data.digest || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sync period selector with parent period
  useEffect(() => {
    const hours = PERIOD_TO_HOURS[period] || 24;
    setSelectedPeriod(Math.min(hours, 72));
  }, [period]);

  async function generateNow() {
    setGenerating(true);
    try {
      const res = await fetch("/api/platform/platform-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_hours: selectedPeriod }),
      });
      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest);
        setExpanded(true);
      }
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  }

  const risk = digest ? RISK_COLORS[digest.risk_level] || RISK_COLORS.watch : RISK_COLORS.watch;

  return (
    <Card className={`py-0 gap-0 ${digest ? risk.border : "border-border"}`}>
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${digest ? risk.bg : "bg-primary/10"}`}>
              <Brain size={14} className={digest ? risk.text : "text-primary"} />
            </div>
            <div>
              <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                AI Platform Health Digest
              </CardTitle>
              {digest && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Generated {timeAgo(digest.generated_at)} · {digest.period_hours}h analysis
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {digest && (
              <Badge variant="outline" className={`text-[10px] ${risk.text} ${risk.border}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${risk.dot} mr-1.5`} />
                {digest.risk_level}
              </Badge>
            )}
            <NativeSelect
              value={String(selectedPeriod)}
              onChange={(e) => setSelectedPeriod(Number(e.target.value))}
              className="w-20 text-xs"
            >
              <option value="1">1h</option>
              <option value="6">6h</option>
              <option value="24">24h</option>
              <option value="48">48h</option>
              <option value="72">72h</option>
            </NativeSelect>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              disabled={generating}
              onClick={generateNow}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generating ? "Analysing..." : "Analyse Now"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Loading latest digest...
          </div>
        ) : !digest ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Brain size={24} className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No platform digest yet. Click &quot;Analyse Now&quot; to generate your first AI-powered health report.
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Covers frontend errors, backend issues, payments, and infrastructure across all tenants.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <p className="text-sm text-foreground leading-relaxed">{digest.summary}</p>

            {/* Area Status Cards */}
            {digest.areas.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {digest.areas.map((area) => {
                  const areaRisk = RISK_COLORS[area.status] || RISK_COLORS.watch;
                  const AreaIcon = AREA_ICONS[area.name] || Activity;
                  return (
                    <div
                      key={area.name}
                      className={`flex items-start gap-2.5 rounded-lg border ${areaRisk.border} ${areaRisk.bg} px-3 py-2.5`}
                    >
                      <AreaIcon size={14} className={`${areaRisk.text} mt-0.5 shrink-0`} />
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${areaRisk.text}`}>{area.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{area.summary}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Expandable Findings + Recommendations */}
            {(digest.findings.length > 0 || digest.recommendations.length > 0) && (
              <>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {digest.findings.length} finding{digest.findings.length !== 1 ? "s" : ""},{" "}
                  {digest.recommendations.length} recommendation{digest.recommendations.length !== 1 ? "s" : ""}
                </button>

                {expanded && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {digest.findings.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                          Findings
                        </h4>
                        <div className="space-y-2">
                          {digest.findings.map((finding, i) => (
                            <div
                              key={i}
                              className={`border-l-2 ${FINDING_COLORS[finding.severity] || "border-l-border"} bg-card rounded-r-lg px-4 py-3`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-medium text-foreground">{finding.title}</p>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${AREA_BADGE_MAP[finding.area] || ""}`}
                                >
                                  {finding.area}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {finding.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {digest.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                          Recommendations
                        </h4>
                        <div className="space-y-1.5">
                          {digest.recommendations.map((rec, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-foreground">
                              <ArrowRight size={10} className="text-primary shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{rec}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Service Health ─────────────────────────────────────────────────

function ServiceHealth({ data }: { data: PlatformHealthData }) {
  const statusIcon = {
    ok: CheckCircle2,
    degraded: AlertTriangle,
    down: XCircle,
  };
  const statusColor = {
    ok: "text-success",
    degraded: "text-warning",
    down: "text-destructive",
  };
  const statusLabel = {
    ok: "Operational",
    degraded: "Degraded",
    down: "Down",
  };

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Core Services
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {data.system.checks.map((check) => {
            const Icon = statusIcon[check.status];
            return (
              <div
                key={check.name}
                className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={14} className={statusColor[check.status]} />
                  <span className="text-sm font-medium text-foreground">{check.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {check.latency}ms
                  </span>
                  <Badge
                    variant={check.status === "ok" ? "success" : check.status === "degraded" ? "warning" : "destructive"}
                    className="text-[10px]"
                  >
                    {statusLabel[check.status]}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sentry Issues Section ──────────────────────────────────────────

function SentryIssuesSection({ data }: { data: PlatformHealthData }) {
  const [showAll, setShowAll] = useState(false);

  if (!data.sentry.connected) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Platform Errors
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Bug size={24} className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Sentry is not connected. Error tracking data is unavailable.
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Configure SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT env vars.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.sentry.issues.length === 0) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Platform Errors
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex items-center gap-3 py-4">
            <CheckCircle2 size={16} className="text-success" />
            <p className="text-sm text-muted-foreground">
              No unresolved errors in this period. All clear across frontend and backend.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleIssues = showAll ? data.sentry.issues : data.sentry.issues.slice(0, 10);
  const hasMore = data.sentry.issues.length > 10;

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Platform Errors
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {data.sentry.total_issues} issue{data.sentry.total_issues !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {data.sentry.issues_by_level.error && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {data.sentry.issues_by_level.error} error{data.sentry.issues_by_level.error !== 1 ? "s" : ""}
              </span>
            )}
            {data.sentry.issues_by_level.warning && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {data.sentry.issues_by_level.warning} warning{data.sentry.issues_by_level.warning !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="space-y-2">
          {visibleIssues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAll ? "Show less" : `Show all ${data.sentry.issues.length} issues`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function IssueRow({ issue }: { issue: SentryIssue }) {
  const levelConfig = {
    error: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
    warning: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
    info: { color: "text-info", bg: "bg-info/10", border: "border-info/20" },
    fatal: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
  }[issue.level] || { color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" };

  const tenantTag = issue.tags.org_id;
  const eventTag = issue.tags.event_slug;
  const runtimeTag = issue.tags.runtime;

  return (
    <div className={`rounded-lg border ${levelConfig.border} ${levelConfig.bg} px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${levelConfig.color} ${levelConfig.border}`}
            >
              {issue.level}
            </Badge>
            {runtimeTag && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {runtimeTag === "node" ? (
                  <><Server size={8} className="mr-1" />server</>
                ) : runtimeTag === "edge" ? (
                  <><Globe size={8} className="mr-1" />edge</>
                ) : (
                  <><Monitor size={8} className="mr-1" />browser</>
                )}
              </Badge>
            )}
            {tenantTag && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                {tenantTag}
              </Badge>
            )}
            {eventTag && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {eventTag}
              </Badge>
            )}
          </div>
          <p className="text-xs font-medium text-foreground break-words">{issue.title}</p>
          {issue.filename && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
              {issue.filename}{issue.function_name ? ` → ${issue.function_name}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
              {issue.count}x
            </span>
            <a
              href={sentryIssueUrl(issue.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View in Sentry"
            >
              <ExternalLink size={12} />
            </a>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {issue.user_count > 0 && `${issue.user_count} user${issue.user_count !== 1 ? "s" : ""} · `}
            {timeAgo(issue.last_seen)}
          </span>
        </div>
      </div>
    </div>
  );
}
