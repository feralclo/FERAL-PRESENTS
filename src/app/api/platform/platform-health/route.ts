import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

const PERIOD_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

interface SentryIssue {
  id: string;
  title: string;
  shortId: string;
  count: string;
  userCount: number;
  level: string;
  status: string;
  firstSeen: string;
  lastSeen: string;
  metadata: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
  project?: { slug: string };
  // Tags may or may not be present depending on Sentry API version/params
  tags?: Array<{ key: string; value: string; topValues?: Array<{ value: string; count: number }> }>;
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const period = request.nextUrl.searchParams.get("period") || "24h";
  const periodMs = PERIOD_MS[period] || PERIOD_MS["24h"];
  const since = new Date(Date.now() - periodMs).toISOString();

  // Run all data fetches in parallel
  const [sentryData, systemHealth, paymentSummary] = await Promise.all([
    fetchSentryIssues(since, period),
    checkSystemHealth(),
    fetchPaymentSummary(since),
  ]);

  // Compute overall status: red/yellow/green
  const overallStatus = computeOverallStatus(sentryData, systemHealth, paymentSummary);

  return NextResponse.json({
    status: overallStatus,
    period,
    timestamp: new Date().toISOString(),
    sentry: sentryData,
    system: systemHealth,
    payments: paymentSummary,
  });
}

// ── Sentry ──────────────────────────────────────────────────────────

async function fetchSentryIssues(since: string, period: string): Promise<{
  connected: boolean;
  total_issues: number;
  total_events: number;
  issues_by_level: Record<string, number>;
  issues: Array<{
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
  }>;
}> {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!authToken || !org || !project) {
    return { connected: false, total_issues: 0, total_events: 0, issues_by_level: {}, issues: [] };
  }

  try {
    // Fetch unresolved issues from the period, sorted by frequency
    const res = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved firstSeen:>${since}&sort=freq&limit=25`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.error(`[platform-health] Sentry API ${res.status}`);
      return { connected: false, total_issues: 0, total_events: 0, issues_by_level: {}, issues: [] };
    }

    const raw: SentryIssue[] = await res.json();

    const issues = raw.map((issue) => {
      // Extract tags if available — Sentry list endpoint may include them
      const tags: Record<string, string> = {};
      if (Array.isArray(issue.tags)) {
        for (const tag of issue.tags) {
          if (tag.key === "org_id" || tag.key === "runtime" || tag.key === "event_slug") {
            // Use topValues if available (grouped tag format), else direct value
            const val = tag.topValues?.[0]?.value || tag.value;
            if (val) tags[tag.key] = val;
          }
        }
      }

      return {
        id: issue.id,
        title: issue.title,
        short_id: issue.shortId,
        count: parseInt(issue.count, 10) || 0,
        user_count: issue.userCount || 0,
        level: issue.level,
        first_seen: issue.firstSeen,
        last_seen: issue.lastSeen,
        type: issue.metadata?.type || "",
        value: issue.metadata?.value || "",
        filename: issue.metadata?.filename || "",
        function_name: issue.metadata?.function || "",
        tags,
      };
    });

    const totalEvents = issues.reduce((sum, i) => sum + i.count, 0);

    const issuesByLevel: Record<string, number> = {};
    for (const issue of issues) {
      issuesByLevel[issue.level] = (issuesByLevel[issue.level] || 0) + 1;
    }

    return {
      connected: true,
      total_issues: issues.length,
      total_events: totalEvents,
      issues_by_level: issuesByLevel,
      issues,
    };
  } catch (err) {
    console.error("[platform-health] Sentry fetch failed:", err);
    return { connected: false, total_issues: 0, total_events: 0, issues_by_level: {}, issues: [] };
  }
}

// ── System Health ───────────────────────────────────────────────────

interface ServiceCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  latency: number;
  detail?: string;
}

async function checkSystemHealth(): Promise<{
  overall: "ok" | "degraded" | "down";
  checks: ServiceCheck[];
}> {
  const checks: ServiceCheck[] = [];

  // Check Supabase
  const supabaseCheck = await checkService("Database", async () => {
    const supabase = await getSupabaseAdmin();
    if (!supabase) throw new Error("Not configured");
    const { error } = await supabase.from(TABLES.SITE_SETTINGS).select("key").limit(1);
    if (error) throw error;
  });
  checks.push(supabaseCheck);

  // Check Stripe
  const stripeCheck = await checkService("Payments", async () => {
    if (!stripe) throw new Error("Not configured");
    await stripe.balance.retrieve();
  });
  checks.push(stripeCheck);

  // Overall status
  const hasDown = checks.some((c) => c.status === "down");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overall = hasDown ? "down" : hasDegraded ? "degraded" : "ok";

  return { overall, checks };
}

async function checkService(name: string, fn: () => Promise<void>): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await fn();
    const latency = Date.now() - start;
    return {
      name,
      status: latency > 2000 ? "degraded" : "ok",
      latency,
    };
  } catch (err) {
    return {
      name,
      status: "down",
      latency: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Payment Summary ─────────────────────────────────────────────────

async function fetchPaymentSummary(since: string): Promise<{
  succeeded: number;
  failed: number;
  failure_rate: number;
  unresolved_critical: number;
  orphaned: number;
  total_failed_pence: number;
}> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return { succeeded: 0, failed: 0, failure_rate: 0, unresolved_critical: 0, orphaned: 0, total_failed_pence: 0 };
  }

  try {
    const [eventsResult, unresolvedResult] = await Promise.all([
      supabase
        .from(TABLES.PAYMENT_EVENTS)
        .select("type, severity, metadata, error_code")
        .gte("created_at", since),
      supabase
        .from(TABLES.PAYMENT_EVENTS)
        .select("id")
        .eq("severity", "critical")
        .eq("resolved", false),
    ]);

    const events = eventsResult.data || [];
    const succeeded = events.filter((e) => e.type === "payment_succeeded").length;
    const failed = events.filter((e) => e.type === "payment_failed").length;
    const total = succeeded + failed;
    const orphaned = events.filter((e) => e.type === "orphaned_payment").length;

    const totalFailedPence = events
      .filter((e) => e.type === "payment_failed")
      .reduce((sum, e) => {
        const meta = e.metadata as { amount?: number } | null;
        return sum + (meta?.amount || 0);
      }, 0);

    return {
      succeeded,
      failed,
      failure_rate: total > 0 ? failed / total : 0,
      unresolved_critical: unresolvedResult.data?.length || 0,
      orphaned,
      total_failed_pence: totalFailedPence,
    };
  } catch {
    return { succeeded: 0, failed: 0, failure_rate: 0, unresolved_critical: 0, orphaned: 0, total_failed_pence: 0 };
  }
}

// ── Overall Status ──────────────────────────────────────────────────

function computeOverallStatus(
  sentry: Awaited<ReturnType<typeof fetchSentryIssues>>,
  system: Awaited<ReturnType<typeof checkSystemHealth>>,
  payments: Awaited<ReturnType<typeof fetchPaymentSummary>>
): "healthy" | "warning" | "critical" {
  // Critical: any service down, orphaned payments, or high Sentry error issues
  if (system.overall === "down") return "critical";
  if (payments.orphaned > 0) return "critical";
  if (payments.unresolved_critical > 0) return "critical";
  if ((sentry.issues_by_level?.error || 0) >= 5) return "critical";

  // Warning: degraded services, high failure rate, or any Sentry errors
  if (system.overall === "degraded") return "warning";
  if (payments.failure_rate > 0.1) return "warning";
  if (sentry.total_issues > 0) return "warning";
  if (payments.failed > 0 && payments.failure_rate > 0.05) return "warning";

  return "healthy";
}
