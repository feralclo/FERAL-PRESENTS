"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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
  Eye,
  Webhook,
  MonitorSmartphone,
  Clock,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  Sparkles,
  Brain,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

interface PaymentEvent {
  id: string;
  org_id: string;
  type: string;
  severity: string;
  event_id: string | null;
  error_code: string | null;
  error_message: string | null;
  stripe_payment_intent_id: string | null;
  stripe_account_id: string | null;
  customer_email: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  resolved: boolean;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

interface PaymentHealthData {
  summary: {
    total_events: number;
    critical_count: number;
    warning_count: number;
    unresolved_count: number;
  };
  payments: {
    succeeded: number;
    failed: number;
    failure_rate: number;
    total_amount_failed_pence: number;
  };
  checkout: {
    errors: number;
    client_errors: number;
    validations: number;
    rate_limit_blocks: number;
  };
  connect: {
    total_accounts: number;
    healthy: number;
    unhealthy: number;
    fallbacks: number;
    unhealthy_list: {
      org_id: string;
      stripe_account_id: string;
      error_message: string;
      created_at: string;
    }[];
  };
  webhooks: {
    received: number;
    errors: number;
    error_rate: number;
  };
  reconciliation: {
    orphaned_payments: number;
    incomplete_payments: number;
  };
  recent_critical: PaymentEvent[];
  failure_by_org: {
    org_id: string;
    succeeded: number;
    failed: number;
    failure_rate: number;
  }[];
  failure_by_code: { code: string; count: number }[];
  hourly_trend: {
    hour: string;
    succeeded: number;
    failed: number;
    errors: number;
  }[];
}

interface DigestFinding {
  title: string;
  detail: string;
  severity: "info" | "watch" | "concern" | "critical";
}

interface PaymentDigestData {
  generated_at: string;
  period_hours: number;
  summary: string;
  risk_level: "healthy" | "watch" | "concern" | "critical";
  findings: DigestFinding[];
  recommendations: string[];
  raw_stats: {
    payments_succeeded: number;
    payments_failed: number;
    failure_rate: number;
    checkout_errors: number;
    client_errors: number;
    incomplete_checkouts: number;
    orphaned_payments: number;
    connect_unhealthy: number;
    webhook_errors: number;
    total_events: number;
    unique_customers_failed: number;
    top_decline_codes: { code: string; count: number }[];
    affected_events: { slug: string; failures: number }[];
    amount_failed_gbp: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** Friendly names for raw event types */
const EVENT_TYPE_LABELS: Record<string, string> = {
  payment_failed: "Payment failed",
  payment_succeeded: "Payment succeeded",
  checkout_error: "Checkout error (server)",
  checkout_validation: "Checkout validation",
  webhook_error: "Webhook error",
  webhook_received: "Webhook received",
  connect_account_unhealthy: "Stripe account unhealthy",
  connect_account_healthy: "Stripe account recovered",
  connect_fallback: "Connect fallback used",
  rate_limit_hit: "Rate limit triggered",
  subscription_failed: "Subscription payment failed",
  orphaned_payment: "Orphaned payment",
  client_checkout_error: "Checkout error (customer's browser)",
  incomplete_payment: "Incomplete checkout",
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

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPence(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(1)}k`;
  return pounds % 1 === 0 ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

function friendlyEventType(type: string): string {
  return EVENT_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

function stripePaymentUrl(piId: string): string {
  return `https://dashboard.stripe.com/payments/${piId}`;
}

// ─── Status Banner ───────────────────────────────────────────────────

function StatusBanner({ data }: { data: PaymentHealthData }) {
  const { unresolved_count } = data.summary;
  const failureRate = data.payments.failure_rate;
  const orphaned = data.reconciliation.orphaned_payments;
  const totalPayments = data.payments.succeeded + data.payments.failed;

  // Use unresolved_count (not critical_count) so resolved events don't keep triggering
  if (unresolved_count > 0 || failureRate > 0.1 || orphaned > 0) {
    const issues: string[] = [];
    if (unresolved_count > 0) issues.push(`${unresolved_count} unresolved issue${unresolved_count !== 1 ? "s" : ""} need attention`);
    if (orphaned > 0) issues.push(`${orphaned} orphaned payment${orphaned !== 1 ? "s" : ""} (money taken, no order created)`);
    if (failureRate > 0.1) issues.push(`${(failureRate * 100).toFixed(1)}% payment failure rate`);

    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4">
        <XCircle size={20} className="text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-destructive">Action Required</p>
          <ul className="mt-1 space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowRight size={10} className="text-destructive shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Warning: minor issues worth noting
  if (data.summary.warning_count > 0 || failureRate > 0.05) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-5 py-4">
        <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-warning">Minor Warnings</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.summary.warning_count} warning{data.summary.warning_count !== 1 ? "s" : ""} detected.
            {failureRate > 0.05 && ` Payment failure rate is ${(failureRate * 100).toFixed(1)}%.`}
            {" "}These are usually card declines or temporary issues — not blocking anyone from buying.
          </p>
        </div>
      </div>
    );
  }

  // All good
  return (
    <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 px-5 py-4">
      <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-success">All Systems Healthy</p>
        <p className="text-xs text-muted-foreground mt-1">
          {totalPayments > 0
            ? `${data.payments.succeeded} successful payment${data.payments.succeeded !== 1 ? "s" : ""} processed with no issues.`
            : "No payment activity in this period — monitoring is active and will flag any problems."}
          {data.connect.total_accounts > 0 && ` All ${data.connect.total_accounts} Stripe account${data.connect.total_accounts !== 1 ? "s" : ""} healthy.`}
        </p>
      </div>
    </div>
  );
}

// ─── AI Health Digest ────────────────────────────────────────────────

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

function AIDigestCard() {
  const [digest, setDigest] = useState<PaymentDigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(6);

  useEffect(() => {
    fetch("/api/platform/payment-digest")
      .then((r) => r.json())
      .then((data) => setDigest(data.digest || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function generateNow() {
    setGenerating(true);
    try {
      const res = await fetch("/api/platform/payment-digest", {
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${digest ? risk.bg : "bg-primary/10"}`}>
              <Brain size={14} className={digest ? risk.text : "text-primary"} />
            </div>
            <div>
              <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                AI Health Digest
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
              <Badge
                variant="outline"
                className={`text-[10px] ${risk.text} ${risk.border}`}
              >
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
              <option value="12">12h</option>
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
              {generating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
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
              No digest yet. Click &quot;Analyse Now&quot; to generate your first AI-powered health report.
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Once generated, digests run automatically every 6 hours.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <p className="text-sm text-foreground leading-relaxed">
              {digest.summary}
            </p>

            {/* Expandable findings + recommendations */}
            {(digest.findings.length > 0 || digest.recommendations.length > 0) && (
              <>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {digest.findings.length} finding{digest.findings.length !== 1 ? "s" : ""}, {digest.recommendations.length} recommendation{digest.recommendations.length !== 1 ? "s" : ""}
                </button>

                {expanded && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Findings */}
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
                              <p className="text-xs font-medium text-foreground">
                                {finding.title}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                {finding.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {digest.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                          Recommendations
                        </h4>
                        <div className="space-y-1.5">
                          {digest.recommendations.map((rec, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs text-foreground"
                            >
                              <ArrowRight size={10} className="text-primary shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{rec}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stats footer */}
                    <div className="flex items-center gap-4 pt-2 border-t border-border/30 text-[10px] text-muted-foreground flex-wrap">
                      <span>{digest.raw_stats.payments_succeeded} succeeded</span>
                      <span>{digest.raw_stats.payments_failed} failed</span>
                      <span>{(digest.raw_stats.failure_rate * 100).toFixed(1)}% rate</span>
                      <span>£{digest.raw_stats.amount_failed_gbp.toFixed(2)} lost</span>
                      <span>{digest.raw_stats.incomplete_checkouts} incomplete</span>
                    </div>
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

// ─── Event Detail Drawer ─────────────────────────────────────────────

function EventDetailDrawer({
  event,
  onClose,
  onResolve,
  resolving,
}: {
  event: PaymentEvent;
  onClose: () => void;
  onResolve: (id: string, notes: string) => void;
  resolving: boolean;
}) {
  const [notes, setNotes] = useState(event.resolution_notes || "");
  const meta = event.metadata || {};
  const metaEntries = Object.entries(meta).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-background border-l border-border overflow-y-auto">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Badge
              variant={event.severity === "critical" ? "destructive" : "outline"}
              className="text-[10px]"
            >
              {event.severity}
            </Badge>
            <span className="text-sm font-medium">{friendlyEventType(event.type)}</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status */}
          {event.resolved && (
            <div className="flex items-center gap-2 text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} />
              <span>
                Resolved {event.resolved_at ? formatTimestamp(event.resolved_at) : ""}
              </span>
            </div>
          )}

          {/* Core Details */}
          <div className="space-y-3">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Event Details
            </h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <span className="text-muted-foreground">Time</span>
              <span className="font-mono">{formatTimestamp(event.created_at)}</span>

              <span className="text-muted-foreground">Time ago</span>
              <span>{timeAgo(event.created_at)}</span>

              <span className="text-muted-foreground">Tenant</span>
              <span className="font-mono">{event.org_id}</span>

              <span className="text-muted-foreground">Event type</span>
              <code className="font-mono text-muted-foreground">{event.type}</code>

              {event.error_code && (
                <>
                  <span className="text-muted-foreground">Error code</span>
                  <code className="font-mono text-destructive">{event.error_code}</code>
                </>
              )}

              {event.customer_email && (
                <>
                  <span className="text-muted-foreground">Customer</span>
                  <span>{event.customer_email}</span>
                </>
              )}

              {event.stripe_payment_intent_id && (
                <>
                  <span className="text-muted-foreground">PaymentIntent</span>
                  <a
                    href={stripePaymentUrl(event.stripe_payment_intent_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline font-mono"
                  >
                    {event.stripe_payment_intent_id.slice(0, 20)}...
                    <ExternalLink size={10} />
                  </a>
                </>
              )}

              {event.stripe_account_id && (
                <>
                  <span className="text-muted-foreground">Stripe account</span>
                  <span className="font-mono">{event.stripe_account_id}</span>
                </>
              )}

              {event.ip_address && (
                <>
                  <span className="text-muted-foreground">IP address</span>
                  <span className="font-mono">{event.ip_address}</span>
                </>
              )}

              {event.event_id && (
                <>
                  <span className="text-muted-foreground">Event ID</span>
                  <span className="font-mono">{event.event_id}</span>
                </>
              )}
            </div>
          </div>

          {/* Error Message */}
          {event.error_message && (
            <div className="space-y-2">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Error Message
              </h3>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {event.error_message}
                </p>
              </div>
            </div>
          )}

          {/* Metadata */}
          {metaEntries.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Metadata
              </h3>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {metaEntries.map(([key, value]) => (
                    <div key={key} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                      <span className="text-muted-foreground font-mono shrink-0 min-w-[100px]">
                        {key}
                      </span>
                      <span className="text-foreground font-mono break-all">
                        {typeof value === "object"
                          ? JSON.stringify(value, null, 2)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Resolution Notes */}
          {event.resolved && event.resolution_notes && (
            <div className="space-y-2">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Resolution Notes
              </h3>
              <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-3">
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {event.resolution_notes}
                </p>
              </div>
            </div>
          )}

          {/* Resolve Action */}
          {!event.resolved && (
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Resolve This Event
              </h3>
              <Textarea
                placeholder="What happened? What did you do to fix it? (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs min-h-[80px] resize-none"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={resolving}
                onClick={() => onResolve(event.id, notes)}
              >
                {resolving ? (
                  <Loader2 size={14} className="animate-spin mr-2" />
                ) : (
                  <CheckCircle2 size={14} className="mr-2" />
                )}
                Mark as Resolved
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Monitoring Coverage Card ────────────────────────────────────────

function MonitoringCoverage({ data }: { data: PaymentHealthData }) {
  const checks = [
    {
      label: "Payment processing",
      description: "Every payment attempt is logged — successes, failures, and the reason for each decline",
      icon: CreditCard,
      active: true,
    },
    {
      label: "Checkout errors (server)",
      description: "Server-side checkout crashes — if the API breaks, you'll know immediately",
      icon: Shield,
      active: true,
    },
    {
      label: "Checkout errors (browser)",
      description: "Client-side failures — if Stripe Elements won't load or a customer's browser crashes during checkout",
      icon: MonitorSmartphone,
      active: true,
    },
    {
      label: "Stripe Connect accounts",
      description: `Checked every 30 minutes — charges enabled, no past-due requirements${data.connect.total_accounts > 0 ? ` (${data.connect.total_accounts} account${data.connect.total_accounts !== 1 ? "s" : ""})` : ""}`,
      icon: Zap,
      active: true,
    },
    {
      label: "Webhook delivery",
      description: "Stripe webhook errors are tracked — if webhooks fail, order creation could be affected",
      icon: Webhook,
      active: true,
    },
    {
      label: "Orphaned payment detection",
      description: "Cross-checks payments against orders every 30 minutes — catches money taken with no order created",
      icon: Eye,
      active: true,
    },
    {
      label: "Incomplete checkout detection",
      description: "Finds PaymentIntents stuck in Stripe (abandoned cards, 3DS timeouts) every 30 minutes",
      icon: Clock,
      active: true,
    },
    {
      label: "Anomaly detection",
      description: "Alerts if any tenant's failure rate exceeds 20%, or if platform-wide failures spike",
      icon: Activity,
      active: true,
    },
    {
      label: "Rate limit monitoring",
      description: "Tracks when checkout rate limits block suspicious IPs — potential bot attacks or abuse",
      icon: ShieldCheck,
      active: true,
    },
  ];

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          What&apos;s Being Monitored
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          These checks run automatically. Critical issues trigger email alerts to the platform owner.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-start gap-3 rounded-lg border border-border/50 px-3.5 py-3"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10 shrink-0 mt-0.5">
                <check.icon size={13} className="text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{check.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {check.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Hourly Chart ────────────────────────────────────────────────────

function HourlyChart({ trend }: { trend: PaymentHealthData["hourly_trend"] }) {
  if (trend.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
        <Clock size={20} className="mb-2 opacity-40" />
        <p className="text-xs">No payment activity in this period</p>
        <p className="text-[10px] mt-0.5 opacity-60">The chart will populate as payments are processed</p>
      </div>
    );
  }

  const maxVal = Math.max(...trend.map((b) => b.succeeded + b.failed + b.errors), 1);

  return (
    <div>
      <div className="flex items-end gap-[2px] h-40 px-1">
        {trend.map((bucket) => {
          const total = bucket.succeeded + bucket.failed + bucket.errors;
          const height = (total / maxVal) * 100;
          const successPct = total > 0 ? (bucket.succeeded / total) * 100 : 100;
          const failPct = total > 0 ? (bucket.failed / total) * 100 : 0;
          const label = bucket.hour.slice(11, 16);

          return (
            <div
              key={bucket.hour}
              className="flex flex-col items-center flex-1 min-w-0"
              title={`${label} — ${bucket.succeeded} succeeded, ${bucket.failed} failed, ${bucket.errors} errors`}
            >
              <div
                className="w-full rounded-t-sm overflow-hidden"
                style={{ height: `${Math.max(height, 2)}%` }}
              >
                <div className="flex flex-col h-full w-full">
                  {failPct > 0 && (
                    <div
                      className="bg-destructive/80 w-full"
                      style={{ height: `${failPct}%` }}
                    />
                  )}
                  <div
                    className="bg-success/60 w-full flex-1"
                    style={{ height: `${successPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success/60" /> Succeeded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive/80" /> Failed
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function PaymentHealthPage() {
  const [data, setData] = useState<PaymentHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<PaymentEvent | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>("all");
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

  async function resolveEvent(id: string, notes?: string) {
    setResolving((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/platform/payment-health/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes || null }),
      });
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            recent_critical: prev.recent_critical.map((e) =>
              e.id === id ? { ...e, resolved: true, resolution_notes: notes || null } : e
            ),
            summary: {
              ...prev.summary,
              unresolved_count: Math.max(0, prev.summary.unresolved_count - 1),
            },
          };
        });
        // Update drawer if open
        setSelectedEvent((prev) =>
          prev?.id === id ? { ...prev, resolved: true, resolution_notes: notes || null } : prev
        );
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

  async function bulkResolve(severity: string) {
    setBulkResolving(true);
    try {
      const res = await fetch("/api/platform/payment-health/resolve-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          severity,
          notes: `Bulk resolved all ${severity} events`,
        }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silently fail
    } finally {
      setBulkResolving(false);
    }
  }

  // ─── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <XCircle size={24} className="text-destructive mx-auto mb-2" />
          <p className="text-sm font-medium text-destructive mb-1">
            Could not load payment health data
          </p>
          <p className="text-xs text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalPayments = data.payments.succeeded + data.payments.failed;

  // Filter events for the list
  const filteredEvents = data.recent_critical.filter((e) => {
    if (eventFilter === "all") return true;
    if (eventFilter === "unresolved") return !e.resolved;
    if (eventFilter === "critical") return e.severity === "critical";
    if (eventFilter === "warning") return e.severity === "warning";
    return e.type === eventFilter;
  });

  const visibleEvents = showAllEvents ? filteredEvents : filteredEvents.slice(0, 15);
  const hasMoreEvents = filteredEvents.length > 15;
  const unresolvedInView = data.recent_critical.filter((e) => !e.resolved);

  // Get unique event types for filter dropdown
  const uniqueTypes = [...new Set(data.recent_critical.map((e) => e.type))];

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Payment Health
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live monitoring across every payment path — server errors, client-side failures, Stripe accounts, and webhook delivery.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NativeSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-40"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
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

      {/* ── Status Banner ── */}
      <StatusBanner data={data} />

      {/* ── AI Health Digest ── */}
      <AIDigestCard />

      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Payment Success Rate"
          value={
            totalPayments > 0
              ? `${((1 - data.payments.failure_rate) * 100).toFixed(1)}%`
              : "—"
          }
          icon={CreditCard}
          detail={
            totalPayments > 0
              ? `${data.payments.succeeded} succeeded, ${data.payments.failed} failed`
              : "No payments in this period"
          }
        />
        <StatCard
          label="Unresolved Issues"
          value={String(data.summary.unresolved_count)}
          icon={
            data.summary.unresolved_count > 0 ? ShieldAlert : ShieldCheck
          }
          detail={
            data.summary.unresolved_count > 0
              ? `${data.summary.critical_count} critical, ${data.summary.warning_count} warnings`
              : "No open issues"
          }
        />
        <StatCard
          label="Stripe Accounts"
          value={
            data.connect.total_accounts > 0
              ? `${data.connect.healthy}/${data.connect.total_accounts}`
              : "—"
          }
          icon={Zap}
          detail={
            data.connect.total_accounts === 0
              ? "No connected accounts"
              : data.connect.unhealthy > 0
                ? `${data.connect.unhealthy} need${data.connect.unhealthy === 1 ? "s" : ""} attention`
                : "All accounts healthy"
          }
        />
        <StatCard
          label="Checkout Errors"
          value={String(
            data.checkout.errors + data.checkout.client_errors
          )}
          icon={MonitorSmartphone}
          detail={
            data.checkout.errors + data.checkout.client_errors === 0
              ? "Clean checkout experience"
              : `${data.checkout.errors} server, ${data.checkout.client_errors} browser`
          }
        />
        <StatCard
          label="Incomplete Checkouts"
          value={String(data.reconciliation.incomplete_payments || 0)}
          icon={Clock}
          detail={
            (data.reconciliation.incomplete_payments || 0) === 0
              ? "No abandoned checkouts detected"
              : "Customers who started but didn't finish"
          }
        />
      </div>

      {/* ── Orphaned Payments Alert ── */}
      {data.reconciliation.orphaned_payments > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <Eye size={18} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              {data.reconciliation.orphaned_payments} Orphaned Payment
              {data.reconciliation.orphaned_payments !== 1 ? "s" : ""} Detected
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              These are payments where Stripe successfully charged the
              customer but no order was created on the platform. This
              usually means the webhook or order confirmation failed.
              Check the events below for details and resolve manually in
              the Stripe dashboard.
            </p>
          </div>
        </div>
      )}

      {/* ── Payment Volume Chart ── */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Payment Volume Over Time
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Hover over bars to see exact counts per hour
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <HourlyChart trend={data.hourly_trend} />
        </CardContent>
      </Card>

      {/* ── Two-column: Decline codes / Failures by tenant ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Decline codes */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Why Payments Failed
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Decline reasons from Stripe — card_declined and
              insufficient_funds are normal customer issues
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {data.failure_by_code.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <CheckCircle2 size={14} className="text-success" />
                No payment failures in this period
              </div>
            ) : (
              <div className="space-y-2">
                {data.failure_by_code.slice(0, 8).map((item) => {
                  const isNormal =
                    item.code === "card_declined" ||
                    item.code === "insufficient_funds" ||
                    item.code === "expired_card";
                  return (
                    <div
                      key={item.code}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="text-xs font-mono text-muted-foreground">
                          {item.code}
                        </code>
                        {isNormal && (
                          <span className="text-[9px] text-muted-foreground/60 uppercase">
                            normal
                          </span>
                        )}
                      </div>
                      <Badge
                        variant={!isNormal && item.count > 2 ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {item.count}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failures by tenant */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Payment Health by Tenant
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Per-tenant failure rates — above 20% triggers an automatic
              alert
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {data.failure_by_org.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <CheckCircle2 size={14} className="text-success" />
                No payment data in this period
              </div>
            ) : (
              <div className="space-y-2">
                {data.failure_by_org.slice(0, 8).map((item) => {
                  const total = item.succeeded + item.failed;
                  const pct = (item.failure_rate * 100).toFixed(0);
                  return (
                    <div
                      key={item.org_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-xs font-mono text-muted-foreground truncate mr-3">
                        {item.org_id}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {item.succeeded}/{total} ok
                        </span>
                        <Badge
                          variant={
                            item.failure_rate > 0.2
                              ? "destructive"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {pct}% fail
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Unhealthy Connect Accounts ── */}
      {data.connect.unhealthy_list.length > 0 && (
        <Card className="py-0 gap-0 border-destructive/30">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-destructive">
              Stripe Accounts Needing Attention
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              These accounts cannot process payments — the tenant&apos;s
              customers will not be able to buy tickets until this is
              resolved
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-3">
              {data.connect.unhealthy_list.map((account, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 text-sm border-b border-border/30 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <code className="text-xs font-mono text-foreground">
                      {account.stripe_account_id}
                    </code>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Tenant: {account.org_id}
                    </p>
                    <p className="text-[11px] text-destructive/80 mt-0.5">
                      {account.error_message}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {timeAgo(account.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Events (Critical + Warning) ── */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Recent Events
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click any event to view full details. Mark events as resolved once investigated.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NativeSelect
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="w-44 text-xs"
              >
                <option value="all">All events ({data.recent_critical.length})</option>
                <option value="unresolved">Unresolved ({unresolvedInView.length})</option>
                <option value="critical">Critical only</option>
                <option value="warning">Warnings only</option>
                {uniqueTypes.map((t) => (
                  <option key={t} value={t}>{friendlyEventType(t)}</option>
                ))}
              </NativeSelect>
              {unresolvedInView.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 gap-1.5"
                  disabled={bulkResolving}
                  onClick={() => bulkResolve("warning")}
                >
                  {bulkResolving ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <CheckCheck size={12} />
                  )}
                  Resolve Warnings
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {filteredEvents.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <CheckCircle2 size={14} className="text-success" />
              {eventFilter === "all"
                ? "No critical or warning events — everything is running smoothly"
                : "No events match this filter"}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`w-full text-left flex items-start justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-card/80 ${
                      event.resolved
                        ? "border-border/30 opacity-50"
                        : event.severity === "critical"
                          ? "border-destructive/20 bg-destructive/5"
                          : "border-border/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={
                            event.severity === "critical"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-[10px]"
                        >
                          {event.severity}
                        </Badge>
                        <span className="text-xs font-medium text-foreground">
                          {friendlyEventType(event.type)}
                        </span>
                        {event.resolved && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-success border-success/30"
                          >
                            resolved
                          </Badge>
                        )}
                        {event.stripe_payment_intent_id && (
                          <span className="text-[10px] text-primary/60 font-mono">
                            {event.stripe_payment_intent_id.slice(0, 15)}...
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                        <span>Tenant: {event.org_id}</span>
                        {event.error_code && (
                          <span>
                            Code: <code className="font-mono">{event.error_code}</code>
                          </span>
                        )}
                        {event.customer_email && (
                          <span>{event.customer_email}</span>
                        )}
                      </div>
                      {event.error_message && (
                        <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-1">
                          {event.error_message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {timeAgo(event.created_at)}
                      </span>
                      {!event.resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-6 px-2"
                          disabled={resolving.has(event.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveEvent(event.id);
                          }}
                        >
                          {resolving.has(event.id) ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            "Resolve"
                          )}
                        </Button>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {hasMoreEvents && (
                <button
                  onClick={() => setShowAllEvents(!showAllEvents)}
                  className="flex items-center gap-1.5 mx-auto mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAllEvents ? (
                    <>
                      <ChevronUp size={14} /> Show fewer
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} /> Show all {filteredEvents.length} events
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Monitoring Coverage ── */}
      <MonitoringCoverage data={data} />

      {/* ── Webhook & Rate Limit Stats ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Received</span>
                <span className="font-mono text-foreground">
                  {data.webhooks.received}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Errors</span>
                <span
                  className={`font-mono ${data.webhooks.errors > 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {data.webhooks.errors}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Error rate</span>
                <span
                  className={`font-mono ${data.webhooks.error_rate > 0.05 ? "text-destructive" : "text-foreground"}`}
                >
                  {(data.webhooks.error_rate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Checkout Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Rate limit blocks
                </span>
                <span className="font-mono text-foreground">
                  {data.checkout.rate_limit_blocks}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Validation catches
                </span>
                <span className="font-mono text-foreground">
                  {data.checkout.validations}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Connect fallbacks
                </span>
                <span
                  className={`font-mono ${data.connect.fallbacks > 0 ? "text-warning" : "text-foreground"}`}
                >
                  {data.connect.fallbacks}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Revenue Impact
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Failed payment value
                </span>
                <span
                  className={`font-mono ${data.payments.total_amount_failed_pence > 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {formatPence(data.payments.total_amount_failed_pence)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Orphaned payments
                </span>
                <span
                  className={`font-mono ${data.reconciliation.orphaned_payments > 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {data.reconciliation.orphaned_payments}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total events</span>
                <span className="font-mono text-foreground">
                  {data.summary.total_events}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Event Detail Drawer ── */}
      {selectedEvent && (
        <EventDetailDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onResolve={resolveEvent}
          resolving={resolving.has(selectedEvent.id)}
        />
      )}
    </div>
  );
}
