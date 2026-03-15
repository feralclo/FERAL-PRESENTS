import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * GET /api/admin/checkout-health
 *
 * Lightweight endpoint for the dashboard checkout health banner.
 * Returns error counts for the last 1h and 24h, scoped to the admin's org.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Checkout errors in last 1h
    const { data: errors1h } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("id, error_message, created_at, severity")
      .eq("org_id", auth.orgId)
      .in("type", ["checkout_error", "client_checkout_error"])
      .in("severity", ["critical", "warning"])
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false });

    // Checkout errors in last 24h (count only)
    const { count: errors24h } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", auth.orgId)
      .in("type", ["checkout_error", "client_checkout_error"])
      .in("severity", ["critical", "warning"])
      .gte("created_at", twentyFourHoursAgo);

    // Filter to only critical errors for the banner (card declines are warnings, not failures)
    const criticalErrors1h = (errors1h || []).filter((e) => e.severity === "critical");
    const lastError = criticalErrors1h[0] || null;

    // Successful payments in last 1h (for failure rate)
    const { count: successes1h } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", auth.orgId)
      .eq("type", "payment_succeeded")
      .gte("created_at", oneHourAgo);

    const totalAttempts = criticalErrors1h.length + (successes1h || 0);
    const failureRate = totalAttempts > 0
      ? Math.round((criticalErrors1h.length / totalAttempts) * 100)
      : 0;

    let status: "healthy" | "degraded" | "down" = "healthy";
    if (criticalErrors1h.length >= 3 || failureRate > 50) {
      status = "down";
    } else if (criticalErrors1h.length >= 1) {
      status = "degraded";
    }

    return NextResponse.json({
      status,
      errors_1h: criticalErrors1h.length,
      errors_24h: errors24h || 0,
      last_error_at: lastError?.created_at || null,
      last_error_message: lastError?.error_message || null,
      failure_rate_1h: failureRate,
    });
  } catch (err) {
    console.error("[checkout-health] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
