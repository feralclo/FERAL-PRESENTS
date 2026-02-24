import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { stripe } from "@/lib/stripe/server";

/**
 * Payment Digest — AI-powered payment health analysis.
 *
 * Gathers comprehensive data from payment_events + Stripe,
 * sends it to Claude for analysis, and returns a structured health report.
 *
 * Uses Claude Haiku via the Anthropic API for cost efficiency:
 * ~2000-4000 input tokens, ~500-1000 output tokens per run.
 * At $0.80/$4.00 per MTok, each digest costs roughly $0.002-0.006.
 * Running every 6 hours = ~$0.01-0.03/day.
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
}

const DIGEST_SETTINGS_KEY = "platform_payment_digest";

/**
 * Gather all the raw data needed for the AI analysis.
 */
async function gatherDigestData(periodHours: number): Promise<{
  stats: DigestStats;
  recentEvents: Array<Record<string, unknown>>;
  incompletePIs: Array<{ id: string; amount: number; currency: string; status: string; description: string | null; created: number }>;
} | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

  // Fetch all events in period
  const { data: events } = await supabase
    .from(TABLES.PAYMENT_EVENTS)
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const allEvents = events || [];

  // Payment stats
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

  // Check Stripe for incomplete PIs (if available)
  let incompletePIs: Array<{ id: string; amount: number; currency: string; status: string; description: string | null; created: number }> = [];
  if (stripe) {
    try {
      const fourHoursAgoUnix = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
      const thirtyMinAgoUnix = Math.floor((Date.now() - 30 * 60 * 1000) / 1000);

      const [abandoned, stuck] = await Promise.all([
        stripe.paymentIntents.search({
          query: `status:"requires_payment_method" AND created>${fourHoursAgoUnix} AND created<${thirtyMinAgoUnix}`,
          limit: 20,
        }),
        stripe.paymentIntents.search({
          query: `status:"requires_action" AND created>${fourHoursAgoUnix} AND created<${thirtyMinAgoUnix}`,
          limit: 20,
        }),
      ]);

      incompletePIs = [...(abandoned.data || []), ...(stuck.data || [])].map((pi) => ({
        id: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        description: pi.description,
        created: pi.created,
      }));
    } catch {
      // Non-fatal
    }
  }

  return {
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
    },
    recentEvents,
    incompletePIs,
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
  periodHours: number;
}): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY environment variable is not set in Vercel" };
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
- Unhealthy Stripe Connect accounts: ${data.stats.connect_unhealthy}
- Webhook errors: ${data.stats.webhook_errors}

## Top Decline Codes
${data.stats.top_decline_codes.length > 0
    ? data.stats.top_decline_codes.map((d) => `- ${d.code}: ${d.count} occurrences`).join("\n")
    : "None — no payment failures"}

## Affected Events
${data.stats.affected_events.length > 0
    ? data.stats.affected_events.map((e) => `- ${e.slug}: ${e.failures} failures`).join("\n")
    : "None"}

## Recent Critical/Warning Events (last 20)
${data.recentEvents.length > 0
    ? JSON.stringify(data.recentEvents, null, 2)
    : "None"}

## Currently Incomplete PaymentIntents in Stripe
${data.incompletePIs.length > 0
    ? data.incompletePIs.map((pi) => `- ${pi.id}: ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()} — ${pi.status} — ${pi.description || "no description"} — created ${Math.round((Date.now() / 1000 - pi.created) / 60)}min ago`).join("\n")
    : "None currently incomplete"}

## Context
- This is a live ticketing platform. Failed payments = lost ticket sales = lost revenue.
- "card_declined", "insufficient_funds", and "expired_card" are normal customer-side issues (not platform problems).
- "checkout_error" and "webhook_error" are platform-side problems that need fixing.
- "orphaned_payment" is the most dangerous — money was taken but no ticket was issued.
- "incomplete_payment" with status "requires_action" usually means a customer abandoned 3D Secure verification.
- "client_checkout_error" means something broke in the customer's browser during checkout.

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
- Include 2-6 findings, ordered by severity (most severe first)
- Include 1-4 recommendations, only actionable ones
- If everything looks good, say so clearly — don't invent problems
- Be specific: "3 customers on FERAL Liverpool had cards declined" not "some payments failed"
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
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
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
      // Parse error for a human-readable message
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

    // Parse the JSON response
    const parsed = JSON.parse(text);
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
