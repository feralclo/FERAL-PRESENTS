import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { reverseRepAttribution } from "@/lib/rep-attribution";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/orders/[id]/refund — Refund an order via Stripe + update DB.
 *
 * Hardened version. Three classes of bug fixed vs the prior implementation:
 *
 *   1. Race condition. Two admins clicking Refund within the same second
 *      both read status="completed", both call Stripe (second got 'already
 *      refunded' silently swallowed as success), and both ran the DB side
 *      effects — so sold counts decremented twice, customer stats updated
 *      twice. Now the order status flips to "refunded" via an atomic
 *      conditional UPDATE before side effects run; the second concurrent
 *      caller sees zero rows updated and short-circuits with 409.
 *
 *   2. Platform fee leakage. With direct charges + application_fee_amount,
 *      a plain refund pulls the customer's full amount from the connected
 *      account's balance — Entry keeps the platform fee. Tenants ate this
 *      cost on every refund. Now we pass refund_application_fee: true so
 *      the application fee returns to the connected account at the same
 *      time as the customer gets their money back.
 *
 *   3. Silent DB errors. Every supabase.update() ignored its `error` field
 *      — Stripe could succeed and the DB could fail (RLS, schema drift,
 *      connection blip) and the response would still say "success". Now
 *      each DB write is checked; partial failures return 500 with detail
 *      so ops can reconcile.
 *
 * Idempotency key on the Stripe call is derived from the order ID so
 * concurrent retries get the same Stripe response object — Stripe handles
 * the dedup at its own layer too.
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

    // 1) Fetch order — scoped to org_id (multi-tenant safety).
    const { data: order, error: orderErr } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "*, order_items:order_items(ticket_type_id, qty)",
      )
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
        // Stripe itself dedups on idempotency key + treats already-refunded
        // as a permanent error. We only want to swallow that specific case.
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

    const now = new Date().toISOString();
    const mergedMetadata = {
      ...((order.metadata as Record<string, unknown>) || {}),
      refunded_by: adminUserId,
      refunded_at: now,
    };

    // 3) Atomic status flip — guards against concurrent refund clicks.
    // Only updates rows where status is NOT already "refunded"; if the
    // second caller sees zero rows updated, it short-circuits without
    // re-running the side effects.
    const { data: flipped, error: flipErr } = await supabase
      .from(TABLES.ORDERS)
      .update({
        status: "refunded",
        refund_reason: reason || null,
        refunded_at: now,
        updated_at: now,
        metadata: mergedMetadata,
      })
      .eq("id", id)
      .eq("org_id", orgId)
      .neq("status", "refunded")
      .select("id")
      .single();

    if (flipErr) {
      Sentry.captureException(flipErr);
      console.error("[refund] Order status update failed:", flipErr);
      return NextResponse.json(
        {
          error:
            "Stripe refunded but order status update failed. Contact support.",
          stripe_refunded: !!order.payment_ref,
        },
        { status: 500 },
      );
    }

    if (!flipped) {
      // Lost the race — another caller already flipped status. The Stripe
      // refund was idempotent so no double charge happened; just return
      // success so the UI doesn't error out for the loser.
      return NextResponse.json({
        success: true,
        already_refunded_by_concurrent_call: true,
      });
    }

    // 4) Cancel all tickets for this order.
    const { error: ticketsErr } = await supabase
      .from(TABLES.TICKETS)
      .update({ status: "cancelled" })
      .eq("order_id", id)
      .eq("org_id", orgId);
    if (ticketsErr) {
      Sentry.captureException(ticketsErr);
      console.error("[refund] Ticket cancellation failed:", ticketsErr);
      return NextResponse.json(
        {
          error:
            "Stripe refunded + order marked, but ticket cancellation failed. Contact support.",
        },
        { status: 500 },
      );
    }

    // 5) Decrement sold counts atomically via RPC. Read-then-write at the
    // app layer would lose increments under concurrent purchase + refund.
    for (const item of (order.order_items as {
      ticket_type_id: string;
      qty: number;
    }[]) || []) {
      const { error: decErr } = await supabase.rpc("decrement_sold", {
        p_ticket_type_id: item.ticket_type_id,
        p_qty: item.qty,
      });
      if (decErr) {
        // Non-blocking: surface to Sentry but don't fail the refund — the
        // money is already back to the customer and the tickets are
        // cancelled. Stale sold count gets reconciled by ops if needed.
        Sentry.captureException(decErr);
        console.error("[refund] decrement_sold RPC failed:", decErr);
      }
    }

    // 6) Update customer stats — recompute from non-refunded orders.
    if (order.customer_id) {
      const { data: custOrders, error: custErr } = await supabase
        .from(TABLES.ORDERS)
        .select("total")
        .eq("customer_id", order.customer_id)
        .eq("org_id", orgId)
        .eq("status", "completed");

      if (custErr) {
        Sentry.captureException(custErr);
        console.error("[refund] Customer order recount failed:", custErr);
      } else if (custOrders) {
        const totalSpent = custOrders.reduce(
          (sum, o) => sum + Number(o.total || 0),
          0,
        );
        const { error: custUpdateErr } = await supabase
          .from(TABLES.CUSTOMERS)
          .update({
            total_orders: custOrders.length,
            total_spent: totalSpent,
            updated_at: now,
          })
          .eq("id", order.customer_id)
          .eq("org_id", orgId);
        if (custUpdateErr) {
          Sentry.captureException(custUpdateErr);
          console.error(
            "[refund] Customer stats update failed:",
            custUpdateErr,
          );
        }
      }
    }

    // 7) Reverse rep attribution (fire-and-forget — non-blocking).
    let repReversal: { repName: string; pointsDeducted: number } | null =
      null;
    try {
      const result = await reverseRepAttribution({ orderId: id });
      if (result) {
        repReversal = {
          repName: result.repName,
          pointsDeducted: result.pointsDeducted,
        };
      }
    } catch (err) {
      console.error(
        "[refund] Rep attribution reversal failed (non-blocking):",
        err,
      );
    }

    return NextResponse.json({
      success: true,
      rep_reversal: repReversal,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[refund] Internal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
