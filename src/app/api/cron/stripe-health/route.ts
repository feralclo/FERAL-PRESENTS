import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { stripe } from "@/lib/stripe/server";
import { logPaymentEvent } from "@/lib/payment-monitor";
import { sendPlatformAlert } from "@/lib/payment-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes

/**
 * GET /api/cron/stripe-health
 *
 * Runs every 30 minutes via Vercel cron. Checks:
 * 1. Stripe Connect account health (charges_enabled, requirements)
 * 2. Payment failure anomaly detection
 * 3. Webhook reconciliation — orphaned payments
 * 4. Incomplete PaymentIntents — abandoned checkouts in Stripe
 * 5. Data retention purge
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase || !stripe) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const results = {
    accounts_checked: 0,
    unhealthy_accounts: [] as string[],
    healthy_recoveries: 0,
    anomalies: [] as string[],
    incomplete_payments: 0,
    purged: { info: 0, warning: 0 },
  };

  try {
    // ── 1. Check Stripe Connect account health ──

    // Get all org Stripe account settings
    const { data: accountSettings } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("key, data")
      .like("key", "%_stripe_account");

    const accounts: { orgId: string; accountId: string }[] = [];
    for (const row of accountSettings || []) {
      const data = row.data as { account_id?: string } | null;
      if (data?.account_id) {
        const orgId = row.key.replace("_stripe_account", "");
        accounts.push({ orgId, accountId: data.account_id });
      }
    }

    // Batch Stripe API calls in groups of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const checks = batch.map(async ({ orgId, accountId }) => {
        try {
          const account = await stripe!.accounts.retrieve(accountId);
          results.accounts_checked++;

          const isHealthy =
            account.charges_enabled === true &&
            (!account.requirements?.past_due || account.requirements.past_due.length === 0);

          if (!isHealthy) {
            results.unhealthy_accounts.push(accountId);
            await logPaymentEvent({
              orgId,
              type: "connect_account_unhealthy",
              severity: "critical",
              stripeAccountId: accountId,
              errorMessage: !account.charges_enabled
                ? "Charges disabled"
                : `Past due requirements: ${account.requirements?.past_due?.join(", ")}`,
              metadata: {
                charges_enabled: account.charges_enabled,
                past_due: account.requirements?.past_due || [],
                capabilities: account.capabilities,
              },
            });
            await sendPlatformAlert({
              subject: `Stripe Connect account unhealthy for org ${orgId}`,
              body: [
                `Account: ${accountId}`,
                `Org: ${orgId}`,
                `Charges enabled: ${account.charges_enabled}`,
                `Past due requirements: ${(account.requirements?.past_due || []).join(", ") || "none"}`,
              ].join("\n"),
              severity: "critical",
            });
          } else {
            // Check if this account was previously unhealthy (recovery)
            const { data: prevUnhealthy } = await supabase!
              .from(TABLES.PAYMENT_EVENTS)
              .select("id")
              .eq("org_id", orgId)
              .eq("type", "connect_account_unhealthy")
              .eq("resolved", false)
              .eq("stripe_account_id", accountId)
              .limit(1);

            if (prevUnhealthy && prevUnhealthy.length > 0) {
              results.healthy_recoveries++;
              await logPaymentEvent({
                orgId,
                type: "connect_account_healthy",
                severity: "info",
                stripeAccountId: accountId,
                errorMessage: "Account recovered — charges enabled and no past due requirements",
              });
              // Mark previous unhealthy events as resolved
              await supabase!
                .from(TABLES.PAYMENT_EVENTS)
                .update({ resolved: true, resolved_at: new Date().toISOString() })
                .eq("org_id", orgId)
                .eq("type", "connect_account_unhealthy")
                .eq("stripe_account_id", accountId)
                .eq("resolved", false);
            }
          }
        } catch (err) {
          results.accounts_checked++;
          results.unhealthy_accounts.push(accountId);
          await logPaymentEvent({
            orgId,
            type: "connect_account_unhealthy",
            severity: "critical",
            stripeAccountId: accountId,
            errorCode: "unreachable",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      });
      await Promise.all(checks);
    }

    // ── 2. Anomaly detection — last hour ──

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Per-org failure rates
    const { data: recentEvents } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("org_id, type")
      .in("type", ["payment_succeeded", "payment_failed"])
      .gte("created_at", oneHourAgo);

    if (recentEvents && recentEvents.length > 0) {
      // Group by org
      const orgStats = new Map<string, { succeeded: number; failed: number }>();
      for (const e of recentEvents) {
        const stats = orgStats.get(e.org_id) || { succeeded: 0, failed: 0 };
        if (e.type === "payment_succeeded") stats.succeeded++;
        else stats.failed++;
        orgStats.set(e.org_id, stats);
      }

      let platformFailures = 0;
      for (const [orgId, stats] of orgStats) {
        const total = stats.succeeded + stats.failed;
        platformFailures += stats.failed;
        if (total >= 5) {
          const failureRate = stats.failed / total;
          if (failureRate > 0.2) {
            const msg = `Org ${orgId}: ${(failureRate * 100).toFixed(0)}% failure rate (${stats.failed}/${total}) in last hour`;
            results.anomalies.push(msg);
            await sendPlatformAlert({
              subject: `High payment failure rate for org ${orgId}`,
              body: msg,
              severity: "warning",
            });
          }
        }
      }

      if (platformFailures > 10) {
        const msg = `Platform-wide: ${platformFailures} payment failures in last hour`;
        results.anomalies.push(msg);
        await sendPlatformAlert({
          subject: "High platform-wide payment failure count",
          body: msg,
          severity: "critical",
        });
      }
    }

    // ── 3. Webhook reconciliation — find orphaned payments ──
    // Check for payment_succeeded events in the last 2 hours that have no matching order.

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: recentSuccesses } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .select("org_id, stripe_payment_intent_id, customer_email, metadata, created_at")
      .eq("type", "payment_succeeded")
      .gte("created_at", twoHoursAgo)
      .not("stripe_payment_intent_id", "is", null);

    if (recentSuccesses && recentSuccesses.length > 0) {
      // Get all payment_refs from orders in last 2 hours
      const { data: recentOrders } = await supabase
        .from(TABLES.ORDERS)
        .select("payment_ref")
        .gte("created_at", twoHoursAgo);

      const orderRefs = new Set((recentOrders || []).map((o) => o.payment_ref));

      for (const pe of recentSuccesses) {
        if (pe.stripe_payment_intent_id && !orderRefs.has(pe.stripe_payment_intent_id)) {
          results.anomalies.push(`Orphaned payment: PI ${pe.stripe_payment_intent_id} for org ${pe.org_id}`);
          await logPaymentEvent({
            orgId: pe.org_id,
            type: "orphaned_payment",
            severity: "critical",
            stripePaymentIntentId: pe.stripe_payment_intent_id,
            customerEmail: pe.customer_email || undefined,
            errorMessage: "Payment succeeded but no matching order found — possible webhook failure",
          });
          await sendPlatformAlert({
            subject: `Orphaned payment detected for org ${pe.org_id}`,
            body: [
              `PaymentIntent: ${pe.stripe_payment_intent_id}`,
              `Org: ${pe.org_id}`,
              `Customer: ${pe.customer_email || "unknown"}`,
              `Payment time: ${pe.created_at}`,
              "",
              "This payment was charged but no order was created.",
              "Check the Stripe dashboard and manually create the order if needed.",
            ].join("\n"),
            severity: "critical",
          });
        }
      }
    }

    // ── 4. Incomplete PaymentIntents — abandoned checkouts ──
    // Check Stripe for recent PIs stuck in requires_payment_method / requires_action.
    // These represent customers who started checkout but never completed.
    // Only flag PIs older than 30 minutes (give people time to complete) and
    // younger than 4 hours (don't flag ancient ones every run).

    try {
      const fourHoursAgoUnix = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
      const thirtyMinAgoUnix = Math.floor((Date.now() - 30 * 60 * 1000) / 1000);

      // Check PIs stuck at requires_payment_method (customer abandoned before entering card)
      const abandonedPIs = await stripe!.paymentIntents.search({
        query: `status:"requires_payment_method" AND created>${fourHoursAgoUnix} AND created<${thirtyMinAgoUnix}`,
        limit: 50,
      });

      // Check PIs stuck at requires_action (3DS challenge abandoned)
      const stuckPIs = await stripe!.paymentIntents.search({
        query: `status:"requires_action" AND created>${fourHoursAgoUnix} AND created<${thirtyMinAgoUnix}`,
        limit: 50,
      });

      const allIncomplete = [...(abandonedPIs.data || []), ...(stuckPIs.data || [])];

      // Check which ones we've already logged (avoid duplicates)
      if (allIncomplete.length > 0) {
        const piIds = allIncomplete.map((pi) => pi.id);
        const { data: existing } = await supabase
          .from(TABLES.PAYMENT_EVENTS)
          .select("stripe_payment_intent_id")
          .eq("type", "incomplete_payment")
          .in("stripe_payment_intent_id", piIds);

        const alreadyLogged = new Set((existing || []).map((e) => e.stripe_payment_intent_id));

        for (const pi of allIncomplete) {
          if (alreadyLogged.has(pi.id)) continue;

          results.incomplete_payments++;
          const meta = pi.metadata || {};
          const ageMinutes = Math.round((Date.now() / 1000 - pi.created) / 60);

          await logPaymentEvent({
            orgId: (meta.org_id as string) || "unknown",
            type: "incomplete_payment",
            severity: "warning",
            stripePaymentIntentId: pi.id,
            customerEmail: (meta.customer_email as string) || undefined,
            errorCode: pi.status,
            errorMessage: pi.status === "requires_action"
              ? `3DS challenge abandoned after ${ageMinutes}min — ${pi.description || "unknown item"} (${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()})`
              : `Checkout abandoned after ${ageMinutes}min — ${pi.description || "unknown item"} (${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()})`,
            metadata: {
              amount: pi.amount,
              currency: pi.currency,
              description: pi.description,
              status: pi.status,
              age_minutes: ageMinutes,
              event_slug: meta.event_slug || null,
            },
          });
        }
      }
    } catch (err) {
      // Non-fatal — log but don't fail the whole cron
      console.error("[stripe-health] Incomplete PI check failed:", err);
    }

    // ── 5. Data retention — purge old events ──

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { count: infoCount } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .delete({ count: "exact" })
      .eq("severity", "info")
      .lt("created_at", thirtyDaysAgo);

    const { count: warningCount } = await supabase
      .from(TABLES.PAYMENT_EVENTS)
      .delete({ count: "exact" })
      .eq("severity", "warning")
      .lt("created_at", ninetyDaysAgo);

    results.purged.info = infoCount || 0;
    results.purged.warning = warningCount || 0;

  } catch (err) {
    console.error("[stripe-health] Cron error:", err);
    return NextResponse.json(
      { error: "Cron job failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ...results });
}
