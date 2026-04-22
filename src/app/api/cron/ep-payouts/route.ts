import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { stripeAccountKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/ep-payouts
 *
 * Monthly payout cron — pays tenants in cash for EP redeemed at their shop,
 * minus the platform cut. Sequence per tenant:
 *
 *   1. plan_tenant_payouts() RPC — read-only, lists tenants whose earned
 *      balance (× rate × (1 − cut)) meets min_payout_pence.
 *   2. For each, look up the tenant's Stripe Connect account. Skip if absent
 *      (log to Sentry — admin needs to connect Stripe).
 *   3. create_pending_payout() RPC — inserts ep_tenant_payouts row with
 *      status='pending'. Gives us an audit trail BEFORE money moves.
 *   4. stripe.transfers.create() with idempotencyKey = payout id. Stripe
 *      dedupes if we retry, so a DB commit failure after Stripe success is
 *      recoverable.
 *   5. On Stripe success → complete_tenant_payout() RPC: writes tenant_payout
 *      ledger entry AND flips payout status to 'paid' in one transaction.
 *   6. On Stripe failure → fail_tenant_payout() RPC: marks failed. Earned
 *      balance stays — next cycle will include it in the next plan.
 *
 * Auth: CRON_SECRET header (same as other /cron/ routes).
 * Schedule: configured in vercel.json — intended to run monthly on the 1st.
 *
 * Response:
 *   {
 *     planned: int,       // tenants eligible for payout this run
 *     paid: int,          // successful Stripe Transfers
 *     skipped_no_stripe_account: int,
 *     failed: int,
 *     total_net_pence: int,
 *     failures: [{ tenant_org_id, reason }]
 *   }
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const stripe = getStripe();

  // 1. Plan — what SHOULD be paid out this cycle
  const { data: planned, error: planError } = await db.rpc(
    "plan_tenant_payouts"
  );
  if (planError) {
    Sentry.captureException(planError, { extra: { step: "plan" } });
    return NextResponse.json(
      { error: "Failed to plan payouts" },
      { status: 500 }
    );
  }

  type Planned = {
    tenant_org_id: string;
    ep_amount: number;
    period_start: string;
    period_end: string;
    fiat_rate_pence: number;
    platform_cut_bps: number;
    gross_pence: number;
    platform_cut_pence: number;
    tenant_net_pence: number;
  };
  const plan = (planned ?? []) as Planned[];

  let paid = 0;
  let skippedNoStripe = 0;
  let failed = 0;
  let totalNetPence = 0;
  const failures: Array<{ tenant_org_id: string; reason: string }> = [];

  for (const item of plan) {
    try {
      // 2. Resolve the tenant's connected Stripe account
      const { data: stripeSetting } = await db
        .from("site_settings")
        .select("data")
        .eq("key", stripeAccountKey(item.tenant_org_id))
        .maybeSingle();

      const accountId =
        (stripeSetting?.data as { account_id?: string } | null)?.account_id ?? null;

      if (!accountId) {
        skippedNoStripe += 1;
        Sentry.captureMessage(
          `[ep-payouts] ${item.tenant_org_id} has earned EP but no Stripe Connect account`,
          {
            level: "warning",
            extra: {
              tenant_org_id: item.tenant_org_id,
              ep_amount: item.ep_amount,
              tenant_net_pence: item.tenant_net_pence,
            },
          }
        );
        continue;
      }

      // 3. Write pending payout row so we have an audit trail pre-Stripe
      const { data: payoutIdData, error: pendingError } = await db.rpc(
        "create_pending_payout",
        {
          p_tenant_org_id: item.tenant_org_id,
          p_ep_amount: item.ep_amount,
          p_period_start: item.period_start,
          p_period_end: item.period_end,
          p_fiat_rate_pence: item.fiat_rate_pence,
          p_platform_cut_bps: item.platform_cut_bps,
          p_gross_pence: item.gross_pence,
          p_platform_cut_pence: item.platform_cut_pence,
          p_tenant_net_pence: item.tenant_net_pence,
        }
      );

      if (pendingError || !payoutIdData) {
        failed += 1;
        failures.push({
          tenant_org_id: item.tenant_org_id,
          reason: "create_pending_payout failed",
        });
        Sentry.captureException(pendingError ?? new Error("no payout id"), {
          extra: { tenant_org_id: item.tenant_org_id },
        });
        continue;
      }

      const payoutId = payoutIdData as string;

      // 4. Issue the Stripe Transfer. Idempotency key is the payout id, so
      // retries (manual, or auto-retry after partial failure) never double-pay.
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: item.tenant_net_pence,
            currency: "gbp",
            destination: accountId,
            description: `Entry EP payout — ${item.ep_amount} EP redeemed in period`,
            metadata: {
              type: "ep_payout",
              tenant_org_id: item.tenant_org_id,
              payout_id: payoutId,
              ep_amount: String(item.ep_amount),
              period_start: item.period_start,
              period_end: item.period_end,
            },
          },
          {
            idempotencyKey: `ep-payout-${payoutId}`,
          }
        );

        // 5. Complete — write ledger + flip status atomically
        const { data: completeData, error: completeError } = await db.rpc(
          "complete_tenant_payout",
          {
            p_payout_id: payoutId,
            p_stripe_transfer_id: transfer.id,
          }
        );

        if (completeError) {
          // Stripe already sent the money. Ledger write failed. Payout row
          // stays pending. Next cron run will see it, the tenant_earned view
          // already decrements on ledger write so unpaid balance is correct.
          // Sentry alerts so we can investigate.
          failed += 1;
          failures.push({
            tenant_org_id: item.tenant_org_id,
            reason: `Stripe succeeded but complete_tenant_payout RPC failed: ${completeError.message}`,
          });
          Sentry.captureException(completeError, {
            level: "error",
            extra: {
              payout_id: payoutId,
              stripe_transfer_id: transfer.id,
              tenant_org_id: item.tenant_org_id,
              note: "MONEY SENT BUT LEDGER INCOMPLETE — manual reconciliation required",
            },
          });
          continue;
        }

        const completed = completeData as {
          success?: boolean;
          already_paid?: boolean;
        };

        if (completed?.success) {
          paid += 1;
          totalNetPence += item.tenant_net_pence;
        }
      } catch (stripeErr) {
        // Stripe failed — mark the payout row as failed. Earned balance stays.
        await db.rpc("fail_tenant_payout", {
          p_payout_id: payoutId,
          p_reason:
            stripeErr instanceof Error ? stripeErr.message : "Stripe error",
        });

        failed += 1;
        failures.push({
          tenant_org_id: item.tenant_org_id,
          reason:
            stripeErr instanceof Error
              ? stripeErr.message
              : "Stripe transfer failed",
        });
        Sentry.captureException(stripeErr, {
          extra: { payout_id: payoutId, tenant_org_id: item.tenant_org_id },
        });
      }
    } catch (err) {
      failed += 1;
      failures.push({
        tenant_org_id: item.tenant_org_id,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
      Sentry.captureException(err, {
        extra: { tenant_org_id: item.tenant_org_id },
      });
    }
  }

  return NextResponse.json({
    planned: plan.length,
    paid,
    skipped_no_stripe_account: skippedNoStripe,
    failed,
    total_net_pence: totalNetPence,
    failures,
  });
}
