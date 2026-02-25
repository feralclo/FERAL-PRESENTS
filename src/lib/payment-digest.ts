import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { stripe } from "@/lib/stripe/server";
import { fetchSentryErrorSummary } from "@/lib/sentry";

/**
 * Payment Digest — AI-powered payment health analysis.
 *
 * Gathers comprehensive data from payment_events + traffic_events + Stripe,
 * sends it to Claude for analysis, and returns a structured health report.
 *
 * Data sources:
 * 1. payment_events — platform-side payment lifecycle (13 event types)
 * 2. traffic_events — checkout funnel (landing → checkout → purchase)
 * 3. Stripe PaymentIntents — abandoned/stuck payments, 3DS analysis
 * 4. Stripe Connect accounts — per-tenant account health
 * 5. Stripe webhook endpoints — delivery success rates
 * 6. Previous digest — historical comparison baselines
 *
 * Uses Claude Haiku via the Anthropic API for cost efficiency:
 * ~3000-6000 input tokens, ~500-1500 output tokens per run.
 * At $0.80/$4.00 per MTok, each digest costs roughly $0.003-0.01.
 * Running every 6 hours = ~$0.01-0.04/day.
 */

export interface PaymentDigest {
  generated_at: string;
  period_hours: number;
  summary: string;
  risk_level: "healthy" | "watch" | "concern" | "critical";
  findings: DigestFinding[];
  recommendations: string[];
  raw_stats: DigestStats;
}

export interface DigestFinding {
  title: string;
  detail: string;
  severity: "info" | "watch" | "concern" | "critical";
}

export interface DigestStats {
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
  // Funnel stats
  funnel_page_views: number;
  funnel_checkout_starts: number;
  funnel_payment_attempts: number;
  funnel_purchases: number;
  checkout_conversion_rate: number;
  // 3DS stats
  three_ds_challenges: number;
  three_ds_completed: number;
  three_ds_abandoned: number;
  three_ds_abandonment_rate: number;
}

interface ConnectAccountHealth {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
  disabled_reason: string | null;
}

interface WebhookEndpointHealth {
  url: string;
  status: string;
  enabled_events: number;
}

interface PreviousDigestComparison {
  prev_generated_at: string;
  prev_period_hours: number;
  prev_payments_succeeded: number;
  prev_payments_failed: number;
  prev_failure_rate: number;
  prev_checkout_errors: number;
  prev_client_errors: number;
  prev_funnel_purchases: number;
  prev_checkout_conversion_rate: number;
}

const DIGEST_SETTINGS_KEY = "platform_payment_digest";

/**
 * Gather all the raw data needed for the AI analysis.
 */
async function gatherDigestData(periodHours: number): Promise<{
  stats: DigestStats;
  recentEvents: Array<Record<string, unknown>>;
  incompletePIs: Array<{ id: string; amount: number; currency: string; status: string; description: string | null; created: number }>;
  connectAccounts: ConnectAccountHealth[];
  webhookEndpoints: WebhookEndpointHealth[];
  previousDigest: PreviousDigestComparison | null;
  sentryErrors: Awaited<ReturnType<typeof fetchSentryErrorSummary>>;
} | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

  // Fetch payment events + traffic events + previous digest in parallel
  const [paymentResult, trafficResult, prevDigestResult] = await Promise.all([
    supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase
      .from("traffic_events")
      .select("event_type, page_path, event_name")
      .gte("timestamp", since)
      .in("event_type", ["landing", "page_view", "checkout_start", "checkout", "payment_processing", "payment_success", "payment_failed", "purchase"]),
    supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", DIGEST_SETTINGS_KEY)
      .single(),
  ]);

  const allEvents = paymentResult.data || [];
  const trafficEvents = trafficResult.data || [];

  // ── Payment stats ──
  const succeeded = allEvents.filter((e) => e.type === "payment_succeeded");
  const failed = allEvents.filter((e) => e.type === "payment_failed");
  const totalPayments = succeeded.length + failed.length;
  const failureRate = totalPayments > 0 ? failed.length / totalPayments : 0;

  // Decline code breakdown
  const codeCounts = new Map<string, number>();
  for (const e of failed) {
    const code = e.error_code || "unknown";
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }
  const topDeclineCodes = Array.from(codeCounts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Unique failed customers
  const failedEmails = new Set(failed.map((e) => e.customer_email).filter(Boolean));

  // Failed amounts
  const amountFailedPence = failed.reduce((sum, e) => {
    const meta = e.metadata as { amount?: number } | null;
    return sum + (meta?.amount || 0);
  }, 0);

  // Affected events (by slug from metadata)
  const eventFailures = new Map<string, number>();
  for (const e of failed) {
    const meta = e.metadata as { event_slug?: string } | null;
    const slug = meta?.event_slug || "unknown";
    eventFailures.set(slug, (eventFailures.get(slug) || 0) + 1);
  }
  const affectedEvents = Array.from(eventFailures.entries())
    .map(([slug, failures]) => ({ slug, failures }))
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 5);

  // Other counts
  const checkoutErrors = allEvents.filter((e) => e.type === "checkout_error").length;
  const clientErrors = allEvents.filter((e) => e.type === "client_checkout_error").length;
  const incompleteCheckouts = allEvents.filter((e) => e.type === "incomplete_payment").length;
  const orphanedPayments = allEvents.filter((e) => e.type === "orphaned_payment").length;
  const connectUnhealthy = allEvents.filter((e) => e.type === "connect_account_unhealthy" && !e.resolved).length;
  const webhookErrors = allEvents.filter((e) => e.type === "webhook_error").length;

  // ── Funnel stats from traffic_events ──
  const funnelPageViews = trafficEvents.filter(
    (e) => e.event_type === "landing" || (e.event_type === "page_view" && e.page_path?.startsWith("/event/"))
  ).length;
  const funnelCheckoutStarts = trafficEvents.filter(
    (e) => e.event_type === "checkout_start" || e.event_type === "checkout"
  ).length;
  const funnelPaymentAttempts = trafficEvents.filter(
    (e) => e.event_type === "payment_processing"
  ).length;
  const funnelPurchases = trafficEvents.filter(
    (e) => e.event_type === "purchase" || e.event_type === "payment_success"
  ).length;
  const checkoutConversionRate = funnelCheckoutStarts > 0
    ? funnelPurchases / funnelCheckoutStarts
    : 0;

  // Get recent critical/warning events for context (last 20)
  const recentEvents = allEvents
    .filter((e) => e.severity === "critical" || e.severity === "warning")
    .slice(0, 20)
    .map((e) => ({
      type: e.type,
      severity: e.severity,
      error_code: e.error_code,
      error_message: e.error_message,
      customer_email: e.customer_email,
      org_id: e.org_id,
      created_at: e.created_at,
      resolved: e.resolved,
      metadata: e.metadata,
    }));

  // ── Stripe data (parallel) ──
  let incompletePIs: Array<{ id: string; amount: number; currency: string; status: string; description: string | null; created: number }> = [];
  let threeDsChallenges = 0;
  let threeDsCompleted = 0;
  let threeDsAbandoned = 0;
  let connectAccounts: ConnectAccountHealth[] = [];
  let webhookEndpoints: WebhookEndpointHealth[] = [];

  if (stripe) {
    const fourHoursAgoUnix = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
    const thirtyMinAgoUnix = Math.floor((Date.now() - 30 * 60 * 1000) / 1000);
    const periodStartUnix = Math.floor((Date.now() - periodHours * 60 * 60 * 1000) / 1000);

    // Run all Stripe queries in parallel
    const [abandonedResult, stuckResult, succeededResult, accountsResult, webhooksResult] = await Promise.allSettled([
      // Abandoned PIs (requires_payment_method, 30min-4hr old)
      stripe.paymentIntents.search({
        query: `status:"requires_payment_method" AND created>${fourHoursAgoUnix} AND created<${thirtyMinAgoUnix}`,
        limit: 20,
      }),
      // Stuck 3DS PIs (requires_action, 30min-4hr old)
      stripe.paymentIntents.search({
        query: `status:"requires_action" AND created>${fourHoursAgoUnix} AND created<${thirtyMinAgoUnix}`,
        limit: 20,
      }),
      // Recent succeeded PIs (for 3DS analysis — check if they went through 3DS)
      stripe.paymentIntents.search({
        query: `status:"succeeded" AND created>${periodStartUnix}`,
        limit: 50,
      }),
      // Connect accounts health
      stripe.accounts.list({ limit: 20 }),
      // Webhook endpoints
      stripe.webhookEndpoints.list({ limit: 10 }),
    ]);

    // Process abandoned + stuck PIs
    const abandoned = abandonedResult.status === "fulfilled" ? abandonedResult.value.data : [];
    const stuck = stuckResult.status === "fulfilled" ? stuckResult.value.data : [];
    incompletePIs = [...abandoned, ...stuck].map((pi) => ({
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      description: pi.description,
      created: pi.created,
    }));

    // 3DS analysis from succeeded + stuck PIs
    if (succeededResult.status === "fulfilled") {
      const succeededPIs = succeededResult.value.data;
      // PIs that went through 3DS have a latest_charge with payment_method_details showing 3DS
      for (const pi of succeededPIs) {
        // If the PI has had an authentication step, it had 3DS
        if (pi.latest_charge && typeof pi.latest_charge === "object") {
          const charge = pi.latest_charge;
          const threeDsOutcome = (charge as { payment_method_details?: { card?: { three_d_secure?: { result?: string } } } })
            ?.payment_method_details?.card?.three_d_secure;
          if (threeDsOutcome) {
            threeDsChallenges++;
            threeDsCompleted++;
          }
        }
      }
    }
    // Stuck requires_action = 3DS challenged but abandoned
    threeDsAbandoned = stuck.length;
    threeDsChallenges += stuck.length;

    // Connect accounts health
    if (accountsResult.status === "fulfilled") {
      connectAccounts = accountsResult.value.data
        .filter((acc) => acc.type === "standard" || acc.type === "express")
        .map((acc) => ({
          account_id: acc.id,
          charges_enabled: acc.charges_enabled ?? false,
          payouts_enabled: acc.payouts_enabled ?? false,
          requirements_due: [
            ...(acc.requirements?.currently_due || []),
            ...(acc.requirements?.past_due || []),
          ],
          disabled_reason: acc.requirements?.disabled_reason || null,
        }));
    }

    // Webhook endpoints health
    if (webhooksResult.status === "fulfilled") {
      webhookEndpoints = webhooksResult.value.data.map((ep) => ({
        url: ep.url,
        status: ep.status,
        enabled_events: ep.enabled_events?.length || 0,
      }));
    }
  }

  const threeDsAbandonmentRate = threeDsChallenges > 0
    ? threeDsAbandoned / threeDsChallenges
    : 0;

  // ── Previous digest for historical comparison ──
  let previousDigest: PreviousDigestComparison | null = null;
  if (prevDigestResult.data?.data) {
    const prev = prevDigestResult.data.data as PaymentDigest;
    if (prev.raw_stats) {
      previousDigest = {
        prev_generated_at: prev.generated_at,
        prev_period_hours: prev.period_hours,
        prev_payments_succeeded: prev.raw_stats.payments_succeeded,
        prev_payments_failed: prev.raw_stats.payments_failed,
        prev_failure_rate: prev.raw_stats.failure_rate,
        prev_checkout_errors: prev.raw_stats.checkout_errors,
        prev_client_errors: prev.raw_stats.client_errors,
        prev_funnel_purchases: prev.raw_stats.funnel_purchases ?? 0,
        prev_checkout_conversion_rate: prev.raw_stats.checkout_conversion_rate ?? 0,
      };
    }
  }

  // ── Sentry platform errors (parallel, non-blocking) ──
  let sentryData: Awaited<ReturnType<typeof fetchSentryErrorSummary>> = null;
  try {
    sentryData = await fetchSentryErrorSummary(periodHours);
  } catch {
    // Non-fatal — digest works without Sentry data
  }

  return {
    sentryErrors: sentryData,
    stats: {
      payments_succeeded: succeeded.length,
      payments_failed: failed.length,
      failure_rate: failureRate,
      checkout_errors: checkoutErrors,
      client_errors: clientErrors,
      incomplete_checkouts: incompleteCheckouts,
      orphaned_payments: orphanedPayments,
      connect_unhealthy: connectUnhealthy,
      webhook_errors: webhookErrors,
      total_events: allEvents.length,
      unique_customers_failed: failedEmails.size,
      top_decline_codes: topDeclineCodes,
      affected_events: affectedEvents,
      amount_failed_gbp: Math.round(amountFailedPence) / 100,
      funnel_page_views: funnelPageViews,
      funnel_checkout_starts: funnelCheckoutStarts,
      funnel_payment_attempts: funnelPaymentAttempts,
      funnel_purchases: funnelPurchases,
      checkout_conversion_rate: checkoutConversionRate,
      three_ds_challenges: threeDsChallenges,
      three_ds_completed: threeDsCompleted,
      three_ds_abandoned: threeDsAbandoned,
      three_ds_abandonment_rate: threeDsAbandonmentRate,
    },
    recentEvents,
    incompletePIs,
    connectAccounts,
    webhookEndpoints,
    previousDigest,
  };
}

/**
 * Call Claude API to generate the health analysis.
 */
type AnalysisResult =
  | { ok: true; data: Omit<PaymentDigest, "generated_at" | "period_hours" | "raw_stats"> }
  | { ok: false; error: string };

async function analyzeWithClaude(data: {
  stats: DigestStats;
  recentEvents: Array<Record<string, unknown>>;
  incompletePIs: Array<{ id: string; amount: number; currency: string; status: string; description: string | null; created: number }>;
  connectAccounts: ConnectAccountHealth[];
  webhookEndpoints: WebhookEndpointHealth[];
  previousDigest: PreviousDigestComparison | null;
  sentryErrors: Awaited<ReturnType<typeof fetchSentryErrorSummary>>;
  periodHours: number;
}): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY environment variable is not set in Vercel" };
  }

  // Build historical comparison section
  let historicalSection = "No previous digest available — this is the first run or baseline.";
  if (data.previousDigest) {
    const p = data.previousDigest;
    const failRateChange = data.stats.failure_rate - p.prev_failure_rate;
    const convChange = data.stats.checkout_conversion_rate - p.prev_checkout_conversion_rate;
    historicalSection = `Previous digest: ${p.prev_generated_at} (${p.prev_period_hours}h window)
- Payments succeeded: ${p.prev_payments_succeeded} → ${data.stats.payments_succeeded} (${data.stats.payments_succeeded - p.prev_payments_succeeded >= 0 ? "+" : ""}${data.stats.payments_succeeded - p.prev_payments_succeeded})
- Payments failed: ${p.prev_payments_failed} → ${data.stats.payments_failed} (${data.stats.payments_failed - p.prev_payments_failed >= 0 ? "+" : ""}${data.stats.payments_failed - p.prev_payments_failed})
- Failure rate: ${(p.prev_failure_rate * 100).toFixed(1)}% → ${(data.stats.failure_rate * 100).toFixed(1)}% (${failRateChange >= 0 ? "+" : ""}${(failRateChange * 100).toFixed(1)}pp)
- Checkout conversion: ${(p.prev_checkout_conversion_rate * 100).toFixed(1)}% → ${(data.stats.checkout_conversion_rate * 100).toFixed(1)}% (${convChange >= 0 ? "+" : ""}${(convChange * 100).toFixed(1)}pp)
- Checkout errors: ${p.prev_checkout_errors} → ${data.stats.checkout_errors}
- Client errors: ${p.prev_client_errors} → ${data.stats.client_errors}
- Purchases: ${p.prev_funnel_purchases} → ${data.stats.funnel_purchases}`;
  }

  // Build Connect accounts section
  let connectSection = "No connected accounts found.";
  if (data.connectAccounts.length > 0) {
    const unhealthy = data.connectAccounts.filter((a) => !a.charges_enabled || !a.payouts_enabled || a.requirements_due.length > 0);
    if (unhealthy.length === 0) {
      connectSection = `${data.connectAccounts.length} connected account(s) — all healthy (charges + payouts enabled, no pending requirements).`;
    } else {
      connectSection = `${data.connectAccounts.length} connected account(s), ${unhealthy.length} with issues:\n` +
        unhealthy.map((a) => {
          const issues: string[] = [];
          if (!a.charges_enabled) issues.push("charges DISABLED");
          if (!a.payouts_enabled) issues.push("payouts DISABLED");
          if (a.disabled_reason) issues.push(`disabled: ${a.disabled_reason}`);
          if (a.requirements_due.length > 0) issues.push(`pending: ${a.requirements_due.join(", ")}`);
          return `- ${a.account_id}: ${issues.join("; ")}`;
        }).join("\n");
    }
  }

  // Build webhook section
  let webhookSection = "No webhook endpoints found — webhooks may not be configured.";
  if (data.webhookEndpoints.length > 0) {
    const disabled = data.webhookEndpoints.filter((e) => e.status === "disabled");
    if (disabled.length === 0) {
      webhookSection = `${data.webhookEndpoints.length} webhook endpoint(s) — all enabled and active.`;
    } else {
      webhookSection = `${data.webhookEndpoints.length} webhook endpoint(s), ${disabled.length} DISABLED:\n` +
        data.webhookEndpoints.map((e) => `- ${e.url}: ${e.status} (${e.enabled_events} event types)`).join("\n");
    }
  }

  const prompt = `You are an expert payment operations analyst for a live event ticketing platform called Entry. Analyse the following payment health data from the last ${data.periodHours} hours and produce a concise diagnostic report.

## Payment Statistics
- Payments succeeded: ${data.stats.payments_succeeded}
- Payments failed: ${data.stats.payments_failed}
- Failure rate: ${(data.stats.failure_rate * 100).toFixed(1)}%
- Failed payment value: £${data.stats.amount_failed_gbp.toFixed(2)}
- Unique customers who experienced failures: ${data.stats.unique_customers_failed}
- Server-side checkout errors: ${data.stats.checkout_errors}
- Client-side (browser) checkout errors: ${data.stats.client_errors}
- Incomplete checkouts (abandoned in Stripe): ${data.stats.incomplete_checkouts}
- Orphaned payments (charged but no order): ${data.stats.orphaned_payments}
- Webhook errors: ${data.stats.webhook_errors}

## Checkout Funnel (${data.periodHours}h)
- Event page views: ${data.stats.funnel_page_views}
- Checkout starts: ${data.stats.funnel_checkout_starts}
- Payment attempts: ${data.stats.funnel_payment_attempts}
- Purchases completed: ${data.stats.funnel_purchases}
- Checkout → Purchase conversion rate: ${(data.stats.checkout_conversion_rate * 100).toFixed(1)}%
${data.stats.funnel_page_views > 0
    ? `- Page view → Purchase rate: ${(data.stats.funnel_purchases / data.stats.funnel_page_views * 100).toFixed(1)}%`
    : ""}

## 3D Secure Analysis
- Total 3DS challenges: ${data.stats.three_ds_challenges}
- 3DS completed (authenticated): ${data.stats.three_ds_completed}
- 3DS abandoned (customer dropped off): ${data.stats.three_ds_abandoned}
- 3DS abandonment rate: ${(data.stats.three_ds_abandonment_rate * 100).toFixed(1)}%

## Historical Comparison
${historicalSection}

## Top Decline Codes
${data.stats.top_decline_codes.length > 0
    ? data.stats.top_decline_codes.map((d) => `- ${d.code}: ${d.count} occurrences`).join("\n")
    : "None — no payment failures"}

## Affected Events
${data.stats.affected_events.length > 0
    ? data.stats.affected_events.map((e) => `- ${e.slug}: ${e.failures} failures`).join("\n")
    : "None"}

## Stripe Connect Account Health
${connectSection}

## Webhook Infrastructure
${webhookSection}

## Recent Critical/Warning Events (last 20)
${data.recentEvents.length > 0
    ? JSON.stringify(data.recentEvents, null, 2)
    : "None"}

## Currently Incomplete PaymentIntents in Stripe
${data.incompletePIs.length > 0
    ? data.incompletePIs.map((pi) => `- ${pi.id}: ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()} — ${pi.status} — ${pi.description || "no description"} — created ${Math.round((Date.now() / 1000 - pi.created) / 60)}min ago`).join("\n")
    : "None currently incomplete"}

## Platform Error Monitoring (Sentry)
${data.sentryErrors
    ? `- Total errors in period: ${data.sentryErrors.total_errors}
- Unresolved issues: ${data.sentryErrors.unresolved_issues}
- Errors by level: ${Object.entries(data.sentryErrors.errors_by_tag).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
${data.sentryErrors.top_issues.length > 0
      ? `- Top issues:\n${data.sentryErrors.top_issues.map((i) => `  - [${i.level}] ${i.title} (${i.count}x, last seen ${i.last_seen})`).join("\n")}`
      : "- No issues in this period"}`
    : "Sentry not configured — only payment-specific monitoring available."}

## Context
- This is a live ticketing platform. Failed payments = lost ticket sales = lost revenue.
- "card_declined", "insufficient_funds", and "expired_card" are normal customer-side issues (not platform problems).
- "checkout_error" and "webhook_error" are platform-side problems that need fixing.
- "orphaned_payment" is the most dangerous — money was taken but no ticket was issued.
- "incomplete_payment" with status "requires_action" usually means a customer abandoned 3D Secure verification.
- "client_checkout_error" means something broke in the customer's browser during checkout.
- A checkout conversion rate below 50% for event ticketing is concerning — typical is 55-75%.
- 3DS abandonment above 20% is high and may indicate checkout UX friction or unnecessary 3DS challenges.
- Compare current stats against historical baselines when available — flag significant deviations (>50% change).
- Disabled webhook endpoints or Connect accounts with disabled charges are critical infrastructure failures.
- Sentry errors show platform-wide issues (API crashes, server component failures, client errors) — not just payment-specific ones. A spike in Sentry errors alongside payment failures may indicate a systemic platform issue vs isolated payment problems.
- If Sentry data is available, include relevant platform stability findings alongside payment findings.

Respond with valid JSON only (no markdown, no code fences), in this exact structure:
{
  "summary": "2-3 sentence plain-English summary of the overall payment health. Be specific — mention numbers, percentages, and what they mean for the business.",
  "risk_level": "healthy|watch|concern|critical",
  "findings": [
    {
      "title": "Short finding title",
      "detail": "1-2 sentence explanation of what this means and why it matters",
      "severity": "info|watch|concern|critical"
    }
  ],
  "recommendations": [
    "Specific actionable recommendation"
  ]
}

Guidelines:
- risk_level: "healthy" = no issues, "watch" = minor things to keep an eye on, "concern" = issues that could affect sales, "critical" = urgent problems affecting revenue
- Include 2-8 findings, ordered by severity (most severe first)
- Include 1-5 recommendations, only actionable ones
- If everything looks good, say so clearly — don't invent problems
- Be specific: "3 customers on FERAL Liverpool had cards declined" not "some payments failed"
- When historical data is available, highlight meaningful changes ("failure rate increased 3x from 2% to 6%")
- Flag checkout funnel drop-offs ("85 page views but only 3 purchases = 3.5% conversion")
- If no payment activity, note that monitoring is active and ready`;

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
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[payment-digest] API ${response.status}: ${errText.slice(0, 200)}`);
      let errorMsg = `Anthropic API returned ${response.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) errorMsg += `: ${errJson.error.message}`;
      } catch {
        errorMsg += `: ${errText.slice(0, 100)}`;
      }
      return { ok: false, error: errorMsg };
    }

    const result = await response.json();
    const text = result.content?.[0]?.text;
    if (!text) {
      return { ok: false, error: "Claude returned an empty response" };
    }

    // Parse the JSON response — strip markdown code fences if the model wraps its output
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      ok: true,
      data: {
        summary: parsed.summary || "Analysis unavailable",
        risk_level: parsed.risk_level || "watch",
        findings: parsed.findings || [],
        recommendations: parsed.recommendations || [],
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[payment-digest] Failed:", msg);
    return { ok: false, error: `Analysis failed: ${msg}` };
  }
}

/**
 * Generate and store a payment digest.
 */
export async function generatePaymentDigest(periodHours: number = 6): Promise<PaymentDigest | null> {
  const data = await gatherDigestData(periodHours);
  if (!data) return null;

  const result = await analyzeWithClaude({ ...data, periodHours });

  const digest: PaymentDigest = {
    generated_at: new Date().toISOString(),
    period_hours: periodHours,
    summary: result.ok ? result.data.summary : result.error,
    risk_level: result.ok ? result.data.risk_level : "watch",
    findings: result.ok ? result.data.findings : [],
    recommendations: result.ok ? result.data.recommendations : [],
    raw_stats: data.stats,
  };

  // Store in site_settings
  const supabase = await getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert({
        key: DIGEST_SETTINGS_KEY,
        data: digest,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
  }

  return digest;
}

/**
 * Get the most recent stored digest.
 */
export async function getLatestDigest(): Promise<PaymentDigest | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", DIGEST_SETTINGS_KEY)
    .single();

  if (!data?.data) return null;
  return data.data as PaymentDigest;
}
