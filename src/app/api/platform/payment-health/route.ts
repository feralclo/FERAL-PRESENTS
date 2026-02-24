import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * GET /api/platform/payment-health
 *
 * Platform-owner-only dashboard API for payment health monitoring.
 * Query params: ?period=1h|6h|24h|7d|30d (default 24h), ?org_id=xxx (optional filter)
 */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "24h";
  const orgFilter = url.searchParams.get("org_id");

  // Calculate time range
  const periodMs: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const since = new Date(Date.now() - (periodMs[period] || periodMs["24h"])).toISOString();

  try {
    // Fetch all events in period
    let query = supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (orgFilter) {
      query = query.eq("org_id", orgFilter);
    }

    const { data: events, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allEvents = events || [];

    // ── Summary ──
    const criticalCount = allEvents.filter((e) => e.severity === "critical").length;
    const warningCount = allEvents.filter((e) => e.severity === "warning").length;

    // Unresolved count (all time, not limited by period)
    let unresolvedQuery = supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("id", { count: "exact", head: true })
      .eq("resolved", false)
      .in("severity", ["warning", "critical"]);
    if (orgFilter) unresolvedQuery = unresolvedQuery.eq("org_id", orgFilter);
    const { count: unresolvedCount } = await unresolvedQuery;

    // ── Payments ──
    const succeeded = allEvents.filter((e) => e.type === "payment_succeeded");
    const failed = allEvents.filter((e) => e.type === "payment_failed");
    const totalPayments = succeeded.length + failed.length;
    const failureRate = totalPayments > 0 ? failed.length / totalPayments : 0;
    const totalAmountFailedPence = failed.reduce((sum, e) => {
      const meta = e.metadata as { amount?: number } | null;
      return sum + (meta?.amount || 0);
    }, 0);

    // ── Checkout ──
    const checkoutErrors = allEvents.filter((e) => e.type === "checkout_error").length;
    const validations = allEvents.filter((e) => e.type === "checkout_validation").length;
    const rateLimitBlocks = allEvents.filter((e) => e.type === "rate_limit_hit").length;

    // ── Connect ──
    const connectUnhealthy = allEvents.filter((e) => e.type === "connect_account_unhealthy");
    const connectHealthy = allEvents.filter((e) => e.type === "connect_account_healthy");
    const connectFallbacks = allEvents.filter((e) => e.type === "connect_fallback").length;

    // Get unique unhealthy accounts (current — unresolved)
    let unhealthyQuery = supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("org_id, stripe_account_id, error_message, created_at")
      .eq("type", "connect_account_unhealthy")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    if (orgFilter) unhealthyQuery = unhealthyQuery.eq("org_id", orgFilter);
    const { data: unhealthyList } = await unhealthyQuery;

    // Count total connected accounts from settings
    let totalAccountsQuery = supabase
      .from(TABLES.SITE_SETTINGS)
      .select("key")
      .like("key", "%_stripe_account");
    const { data: accountRows } = await totalAccountsQuery;
    const totalAccounts = (accountRows || []).filter((r) => {
      if (orgFilter) {
        return r.key === `${orgFilter}_stripe_account`;
      }
      return true;
    }).length;

    const uniqueUnhealthy = new Set((unhealthyList || []).map((e) => e.stripe_account_id)).size;

    // ── Webhooks ──
    const webhookReceived = allEvents.filter((e) => e.type === "webhook_received").length;
    const webhookErrors = allEvents.filter((e) => e.type === "webhook_error").length;
    const webhookTotal = webhookReceived + webhookErrors + succeeded.length + failed.length;

    // ── Recent critical events ──
    const recentCritical = allEvents
      .filter((e) => e.severity === "critical" || e.severity === "warning")
      .slice(0, 20);

    // ── Failure by org ──
    const orgFailures = new Map<string, { succeeded: number; failed: number }>();
    for (const e of allEvents) {
      if (e.type === "payment_succeeded" || e.type === "payment_failed") {
        const stats = orgFailures.get(e.org_id) || { succeeded: 0, failed: 0 };
        if (e.type === "payment_succeeded") stats.succeeded++;
        else stats.failed++;
        orgFailures.set(e.org_id, stats);
      }
    }
    const failureByOrg = Array.from(orgFailures.entries())
      .map(([org_id, stats]) => ({
        org_id,
        succeeded: stats.succeeded,
        failed: stats.failed,
        failure_rate: (stats.succeeded + stats.failed) > 0
          ? stats.failed / (stats.succeeded + stats.failed)
          : 0,
      }))
      .sort((a, b) => b.failure_rate - a.failure_rate);

    // ── Failure by decline code ──
    const codeCounts = new Map<string, number>();
    for (const e of failed) {
      const code = e.error_code || "unknown";
      codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
    }
    const failureByCode = Array.from(codeCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    // ── Hourly trend ──
    const hourlyBuckets = new Map<string, { succeeded: number; failed: number; errors: number }>();
    for (const e of allEvents) {
      const hour = e.created_at.slice(0, 13) + ":00:00"; // YYYY-MM-DDTHH:00:00
      const bucket = hourlyBuckets.get(hour) || { succeeded: 0, failed: 0, errors: 0 };
      if (e.type === "payment_succeeded") bucket.succeeded++;
      else if (e.type === "payment_failed") bucket.failed++;
      else if (e.severity === "critical" || e.severity === "warning") bucket.errors++;
      hourlyBuckets.set(hour, bucket);
    }
    const hourlyTrend = Array.from(hourlyBuckets.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return NextResponse.json({
      summary: {
        total_events: allEvents.length,
        critical_count: criticalCount,
        warning_count: warningCount,
        unresolved_count: unresolvedCount || 0,
      },
      payments: {
        succeeded: succeeded.length,
        failed: failed.length,
        failure_rate: failureRate,
        total_amount_failed_pence: totalAmountFailedPence,
      },
      checkout: {
        errors: checkoutErrors,
        validations,
        rate_limit_blocks: rateLimitBlocks,
      },
      connect: {
        total_accounts: totalAccounts,
        healthy: totalAccounts - uniqueUnhealthy,
        unhealthy: uniqueUnhealthy,
        fallbacks: connectFallbacks,
        unhealthy_list: unhealthyList || [],
      },
      webhooks: {
        received: webhookTotal,
        errors: webhookErrors,
        error_rate: webhookTotal > 0 ? webhookErrors / webhookTotal : 0,
      },
      recent_critical: recentCritical,
      failure_by_org: failureByOrg,
      failure_by_code: failureByCode,
      hourly_trend: hourlyTrend,
    });
  } catch (err) {
    console.error("[payment-health] API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
