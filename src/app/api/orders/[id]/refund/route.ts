import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { applyRefundSideEffects } from "@/lib/refund";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/orders/[id]/refund — Refund an order via Stripe + sync DB.
 *
 * Two-phase flow:
 *
 *   1. Stripe-side: stripe.refunds.create() with refund_application_fee
 *      so the platform fee returns to the connected account, and an
 *      idempotency key derived from the order ID so concurrent retries
 *      get the same response.
 *   2. DB-side: applyRefundSideEffects() — atomic status flip, ticket
 *      cancellation, atomic sold-count decrement, discount used_count
 *      decrement, customer-stats recompute, rep attribution reversal,
 *      buyer notification email.
 *
 * The DB-side logic lives in lib/refund.ts so the charge.refunded webhook
 * can reuse it for refunds initiated in the Stripe Dashboard.
 *
 * Multi-tenant: order is fetched with .eq("org_id", auth.orgId) — refunds
 * can only ever target the caller's own org's orders.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;
    const adminUserId = auth.user.id;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { reason } = body as { reason?: string };

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
    }

    // 1) Pre-fetch order to determine Stripe routing + sanity checks.
    const { data: order, error: orderErr } = await supabase
      .from(TABLES.ORDERS)
      .select("id, status, payment_ref, payment_method, event_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    if (order.status === "refunded") {
      return NextResponse.json(
        { error: "Order already refunded" },
        { status: 400 },
      );
    }

    // 2) Issue Stripe refund (only for Stripe-paid orders).
    if (order.payment_ref && order.payment_method === "stripe") {
      const stripe = getStripe();

      // Determine which Stripe account the charge happened on.
      // Priority: event.stripe_account_id → org's Stripe → platform.
      let stripeAccountId: string | null = null;

      if (order.event_id) {
        const { data: eventRow } = await supabase
          .from(TABLES.EVENTS)
          .select("stripe_account_id")
          .eq("id", order.event_id)
          .eq("org_id", orgId)
          .single();
        if (eventRow?.stripe_account_id) {
          stripeAccountId = eventRow.stripe_account_id;
        }
      }

      if (!stripeAccountId) {
        const { data: settingsRow } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", stripeAccountKey(orgId))
          .single();
        if (settingsRow?.data && typeof settingsRow.data === "object") {
          const settingsData = settingsRow.data as { account_id?: string };
          if (settingsData.account_id) {
            stripeAccountId = settingsData.account_id;
          }
        }
      }

      stripeAccountId = await verifyConnectedAccount(stripeAccountId);

      try {
        await stripe.refunds.create(
          {
            payment_intent: order.payment_ref,
            reason: "requested_by_customer",
            // Refunds the platform's application fee back to the connected
            // account — without this Entry keeps the fee on a refunded sale,
            // which is unfair to tenants and accounting-noisy.
            refund_application_fee: true,
            metadata: {
              order_id: id,
              org_id: orgId,
              refunded_by: adminUserId,
              admin_reason: reason || "",
            },
          },
          {
            idempotencyKey: `refund_${id}`,
            ...(stripeAccountId
              ? { stripeAccount: stripeAccountId }
              : {}),
          },
        );
      } catch (stripeErr) {
        const msg =
          stripeErr instanceof Error
            ? stripeErr.message
            : String(stripeErr);
        // Stripe dedups via idempotency key + treats already-refunded as a
        // permanent error. We only want to swallow that specific case.
        if (!/already (been )?refunded/i.test(msg)) {
          Sentry.captureException(stripeErr);
          console.error("[refund] Stripe refund failed:", msg);
          return NextResponse.json(
            { error: `Stripe refund failed: ${msg}` },
            { status: 502 },
          );
        }
        console.warn(
          "[refund] Stripe says already refunded — proceeding to sync DB",
        );
      }
    }

    // 3) Apply DB side effects via shared lib (also runs for non-Stripe orders).
    let result;
    try {
      result = await applyRefundSideEffects(id, orgId, {
        reason: reason || null,
        adminUserId,
        source: "admin_ui",
      });
    } catch (sideEffectErr) {
      Sentry.captureException(sideEffectErr);
      const msg =
        sideEffectErr instanceof Error
          ? sideEffectErr.message
          : "Side-effect failure";
      return NextResponse.json(
        {
          error: `Stripe refunded but database update failed: ${msg}. Contact support.`,
          stripe_refunded: !!order.payment_ref,
        },
        { status: 500 },
      );
    }

    if (!result.applied) {
      // Lost the race — another caller already did the work.
      return NextResponse.json({
        success: true,
        already_refunded_by_concurrent_call: true,
      });
    }

    return NextResponse.json({
      success: true,
      email_sent: result.email_sent,
      rep_reversal: result.rep_reversal,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[refund] Internal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
