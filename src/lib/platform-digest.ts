import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { stripe } from "@/lib/stripe/server";
import { fetchSentryErrorSummary } from "@/lib/sentry";

/**
 * Platform Health Digest — AI-powered whole-platform analysis.
 *
 * Expands on the payment digest to cover:
 * 1. Sentry errors (frontend crashes, API failures, all tenants)
 * 2. Payment health (success/failure rates, orphans, 3DS)
 * 3. Checkout funnel (conversion, drop-offs)
 * 4. Infrastructure (Stripe Connect, webhooks)
 *
 * Uses Claude Haiku for cost efficiency (~$0.005-0.015 per run).
 */

export interface PlatformDigest {
  generated_at: string;
  period_hours: number;
  summary: string;
  risk_level: "healthy" | "watch" | "concern" | "critical";
  areas: PlatformArea[];
  findings: PlatformFinding[];
  recommendations: string[];
  raw_data: PlatformDigestData;
}

export interface PlatformArea {
  name: string;
  status: "healthy" | "watch" | "concern" | "critical";
  summary: string;
}

export interface PlatformFinding {
  title: string;
  detail: string;
  severity: "info" | "watch" | "concern" | "critical";
  area: "frontend" | "backend" | "payments" | "infrastructure";
}

interface PlatformDigestData {
  sentry: {
    total_errors: number;
    unresolved_issues: number;
    error_issues: number;
    warning_issues: number;
    top_issues: Array<{
      title: string;
      count: number;
      level: string;
      first_seen: string;
      last_seen: string;
    }>;
  } | null;
  payments: {
    succeeded: number;
    failed: number;
    failure_rate: number;
    amount_failed_gbp: number;
    orphaned: number;
    checkout_errors: number;
    client_errors: number;
    incomplete: number;
    webhook_errors: number;
    unique_failed_customers: number;
    top_decline_codes: Array<{ code: string; count: number }>;
    affected_events: Array<{ slug: string; failures: number }>;
  };
  funnel: {
    page_views: number;
    checkout_starts: number;
    payment_attempts: number;
    purchases: number;
    conversion_rate: number;
  };
  infrastructure: {
    connect_accounts_total: number;
    connect_unhealthy: number;
    webhook_endpoints_total: number;
    webhook_disabled: number;
  };
}

const PLATFORM_DIGEST_KEY = "platform_health_digest";

/**
 * Gather all platform health data.
 */
async function gatherPlatformData(periodHours: number): Promise<PlatformDigestData | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

  // Parallel: Sentry + payment events + traffic events
  const [sentryData, paymentResult, trafficResult] = await Promise.all([
    fetchSentryErrorSummary(periodHours).catch(() => null),
    supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("type, severity, error_code, customer_email, metadata, resolved")
      .gte("created_at", since),
    supabase
      .from("traffic_events")
      .select("event_type, page_path")
      .gte("timestamp", since)
      .in("event_type", [
        "landing", "page_view", "checkout_start", "checkout",
        "payment_processing", "payment_success", "payment_failed", "purchase",
      ]),
  ]);

  const events = paymentResult.data || [];
  const traffic = trafficResult.data || [];

  // Payment stats
  const succeeded = events.filter((e) => e.type === "payment_succeeded");
  const failed = events.filter((e) => e.type === "payment_failed");
  const totalPayments = succeeded.length + failed.length;

  const codeCounts = new Map<string, number>();
  for (const e of failed) {
    const code = e.error_code || "unknown";
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }

  const failedEmails = new Set(failed.map((e) => e.customer_email).filter(Boolean));

  const amountFailedPence = failed.reduce((sum, e) => {
    const meta = e.metadata as { amount?: number } | null;
    return sum + (meta?.amount || 0);
  }, 0);

  const eventFailures = new Map<string, number>();
  for (const e of failed) {
    const meta = e.metadata as { event_slug?: string } | null;
    const slug = meta?.event_slug || "unknown";
    eventFailures.set(slug, (eventFailures.get(slug) || 0) + 1);
  }

  // Funnel stats
  const pageViews = traffic.filter(
    (e) => e.event_type === "landing" || (e.event_type === "page_view" && e.page_path?.startsWith("/event/"))
  ).length;
  const checkoutStarts = traffic.filter(
    (e) => e.event_type === "checkout_start" || e.event_type === "checkout"
  ).length;
  const paymentAttempts = traffic.filter((e) => e.event_type === "payment_processing").length;
  const purchases = traffic.filter(
    (e) => e.event_type === "purchase" || e.event_type === "payment_success"
  ).length;

  // Infrastructure — Stripe Connect + webhooks (parallel, non-blocking)
  let connectTotal = 0;
  let connectUnhealthy = 0;
  let webhookTotal = 0;
  let webhookDisabled = 0;

  if (stripe) {
    const [accountsResult, webhooksResult] = await Promise.allSettled([
      stripe.accounts.list({ limit: 50 }),
      stripe.webhookEndpoints.list({ limit: 10 }),
    ]);

    if (accountsResult.status === "fulfilled") {
      const accounts = accountsResult.value.data.filter(
        (a) => a.type === "standard" || a.type === "express"
      );
      connectTotal = accounts.length;
      connectUnhealthy = accounts.filter(
        (a) => !a.charges_enabled || !a.payouts_enabled || (a.requirements?.past_due?.length || 0) > 0
      ).length;
    }

    if (webhooksResult.status === "fulfilled") {
      webhookTotal = webhooksResult.value.data.length;
      webhookDisabled = webhooksResult.value.data.filter((e) => e.status === "disabled").length;
    }
  }

  // Process Sentry data
  let sentryProcessed: PlatformDigestData["sentry"] = null;
  if (sentryData) {
    const errorCount = sentryData.errors_by_tag["error"] || 0;
    const warningCount = sentryData.errors_by_tag["warning"] || 0;
    sentryProcessed = {
      total_errors: sentryData.total_errors,
      unresolved_issues: sentryData.unresolved_issues,
      error_issues: errorCount,
      warning_issues: warningCount,
      top_issues: sentryData.top_issues,
    };
  }

  return {
    sentry: sentryProcessed,
    payments: {
      succeeded: succeeded.length,
      failed: failed.length,
      failure_rate: totalPayments > 0 ? failed.length / totalPayments : 0,
      amount_failed_gbp: Math.round(amountFailedPence) / 100,
      orphaned: events.filter((e) => e.type === "orphaned_payment").length,
      checkout_errors: events.filter((e) => e.type === "checkout_error").length,
      client_errors: events.filter((e) => e.type === "client_checkout_error").length,
      incomplete: events.filter((e) => e.type === "incomplete_payment").length,
      webhook_errors: events.filter((e) => e.type === "webhook_error").length,
      unique_failed_customers: failedEmails.size,
      top_decline_codes: Array.from(codeCounts.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      affected_events: Array.from(eventFailures.entries())
        .map(([slug, failures]) => ({ slug, failures }))
        .sort((a, b) => b.failures - a.failures)
        .slice(0, 5),
    },
    funnel: {
      page_views: pageViews,
      checkout_starts: checkoutStarts,
      payment_attempts: paymentAttempts,
      purchases,
      conversion_rate: checkoutStarts > 0 ? purchases / checkoutStarts : 0,
    },
    infrastructure: {
      connect_accounts_total: connectTotal,
      connect_unhealthy: connectUnhealthy,
      webhook_endpoints_total: webhookTotal,
      webhook_disabled: webhookDisabled,
    },
  };
}

/**
 * Analyze platform data with Claude.
 */
async function analyzeWithClaude(
  data: PlatformDigestData,
  periodHours: number
): Promise<{
  ok: true;
  result: Omit<PlatformDigest, "generated_at" | "period_hours" | "raw_data">;
} | {
  ok: false;
  error: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const prompt = `You are a platform health analyst for Entry, a live event ticketing SaaS platform. Multiple tenants (event promoters) use this platform to sell tickets. Analyze this ${periodHours}-hour health snapshot and produce a diagnostic report covering the ENTIRE platform — frontend, backend, payments, and infrastructure.

## Platform Errors (Sentry — covers frontend + backend + all tenants)
${data.sentry
    ? `- Total error events: ${data.sentry.total_errors}
- Unresolved issues: ${data.sentry.unresolved_issues}
- Error-level issues: ${data.sentry.error_issues}
- Warning-level issues: ${data.sentry.warning_issues}
${data.sentry.top_issues.length > 0
      ? `- Top issues:\n${data.sentry.top_issues.map((i) => `  - [${i.level}] "${i.title}" — ${i.count} events, last seen ${i.last_seen}`).join("\n")}`
      : "- No issues in this period"}`
    : "Sentry not connected — no frontend/backend error data available."}

## Payment Health
- Succeeded: ${data.payments.succeeded}
- Failed: ${data.payments.failed} (${(data.payments.failure_rate * 100).toFixed(1)}% rate)
- Failed value: £${data.payments.amount_failed_gbp.toFixed(2)}
- Unique customers affected: ${data.payments.unique_failed_customers}
- Orphaned payments: ${data.payments.orphaned} (money taken, no ticket)
- Server checkout errors: ${data.payments.checkout_errors}
- Client (browser) errors: ${data.payments.client_errors}
- Incomplete checkouts: ${data.payments.incomplete}
- Webhook errors: ${data.payments.webhook_errors}
${data.payments.top_decline_codes.length > 0
    ? `- Top decline codes: ${data.payments.top_decline_codes.map((d) => `${d.code} (${d.count})`).join(", ")}`
    : ""}
${data.payments.affected_events.length > 0
    ? `- Events with failures: ${data.payments.affected_events.map((e) => `${e.slug} (${e.failures})`).join(", ")}`
    : ""}

## Checkout Funnel
- Event page views: ${data.funnel.page_views}
- Checkout starts: ${data.funnel.checkout_starts}
- Payment attempts: ${data.funnel.payment_attempts}
- Purchases: ${data.funnel.purchases}
- Conversion rate: ${(data.funnel.conversion_rate * 100).toFixed(1)}%

## Infrastructure
- Stripe Connect accounts: ${data.infrastructure.connect_accounts_total} total, ${data.infrastructure.connect_unhealthy} unhealthy
- Webhook endpoints: ${data.infrastructure.webhook_endpoints_total} total, ${data.infrastructure.webhook_disabled} disabled

## Context
- Entry is a multi-tenant ticketing platform. Each tenant (promoter) has their own storefront.
- Frontend errors affect ticket buyers — crashes on event pages mean lost sales.
- "card_declined" and "insufficient_funds" are normal (customer's bank, not our fault).
- "checkout_error" and "webhook_error" are platform bugs that need fixing urgently.
- "orphaned_payment" is the most critical — customer was charged but got no ticket.
- Checkout conversion below 50% for event ticketing is concerning (typical: 55-75%).
- Any Sentry error tagged with a specific org_id or event_slug means a tenant-specific issue.
- Sentry errors without tags are platform-wide issues affecting all tenants.

Respond with ONLY valid JSON (no markdown fences), in this exact structure:
{
  "summary": "2-3 sentence plain-English summary of overall platform health. Mention specific numbers and what they mean.",
  "risk_level": "healthy|watch|concern|critical",
  "areas": [
    {
      "name": "Frontend|Backend|Payments|Infrastructure",
      "status": "healthy|watch|concern|critical",
      "summary": "One sentence status for this area"
    }
  ],
  "findings": [
    {
      "title": "Short finding title",
      "detail": "1-2 sentence explanation",
      "severity": "info|watch|concern|critical",
      "area": "frontend|backend|payments|infrastructure"
    }
  ],
  "recommendations": [
    "Specific actionable recommendation"
  ]
}

Guidelines:
- ALWAYS include all 4 areas (Frontend, Backend, Payments, Infrastructure) in the areas array
- risk_level: "healthy" if nothing wrong, "watch" for minor items, "concern" for issues needing attention, "critical" for urgent problems
- 2-8 findings, ordered by severity
- 1-5 recommendations, only actionable
- If no data (no traffic, no errors), say monitoring is active and ready
- Be specific: "3 TypeError crashes on event pages" not "some frontend errors"
- Sentry errors = real bugs that affect real users. Flag them clearly.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[platform-digest] API ${response.status}: ${errText.slice(0, 200)}`);
      return { ok: false, error: `Anthropic API returned ${response.status}` };
    }

    const result = await response.json();
    const text = result.content?.[0]?.text;
    if (!text) return { ok: false, error: "Empty response from Claude" };

    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      ok: true,
      result: {
        summary: parsed.summary || "Analysis unavailable",
        risk_level: parsed.risk_level || "watch",
        areas: parsed.areas || [],
        findings: parsed.findings || [],
        recommendations: parsed.recommendations || [],
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[platform-digest] Failed:", msg);
    return { ok: false, error: `Analysis failed: ${msg}` };
  }
}

/**
 * Generate and store a platform health digest.
 */
export async function generatePlatformDigest(periodHours: number = 6): Promise<PlatformDigest | null> {
  const data = await gatherPlatformData(periodHours);
  if (!data) return null;

  const result = await analyzeWithClaude(data, periodHours);

  const digest: PlatformDigest = {
    generated_at: new Date().toISOString(),
    period_hours: periodHours,
    summary: result.ok ? result.result.summary : result.error,
    risk_level: result.ok ? result.result.risk_level : "watch",
    areas: result.ok ? result.result.areas : [],
    findings: result.ok ? result.result.findings : [],
    recommendations: result.ok ? result.result.recommendations : [],
    raw_data: data,
  };

  // Store
  const supabase = await getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        { key: PLATFORM_DIGEST_KEY, data: digest, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
  }

  return digest;
}

/**
 * Get the latest stored platform digest.
 */
export async function getLatestPlatformDigest(): Promise<PlatformDigest | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", PLATFORM_DIGEST_KEY)
    .single();

  if (!data?.data) return null;
  return data.data as PlatformDigest;
}
