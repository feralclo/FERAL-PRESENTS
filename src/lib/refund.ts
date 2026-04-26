import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { reverseRepAttribution } from "@/lib/rep-attribution";
import { sendOrderRefundEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";

/**
 * applyRefundSideEffects — single shared implementation of "after a refund
 * went through, sync our DB + notify the buyer".
 *
 * Called from two places:
 *
 *   1. POST /api/orders/[id]/refund            — admin clicks Refund in our UI
 *   2. webhook charge.refunded handler         — refund initiated in Stripe
 *                                                Dashboard, we get notified
 *
 * The Stripe-side action (stripe.refunds.create) is the caller's job — by
 * the time we run, the money is already on its way back to the buyer.
 *
 * Idempotent: the order status flip is an atomic UPDATE WHERE status !=
 * 'refunded'. If another caller already did the work, we short-circuit
 * with `{ already_refunded: true }` and don't repeat the side effects —
 * the second click in our UI, or the webhook arriving after our own POST,
 * both safely no-op.
 *
 * Side effects (in order):
 *   1. Atomic order status flip (returns null if already refunded → exit)
 *   2. Cancel all tickets on the order
 *   3. Decrement sold counts via decrement_sold() RPC
 *   4. Decrement discount used_count if a discount was applied
 *   5. Recompute customer total_orders + total_spent
 *   6. Reverse rep attribution
 *   7. Send refund email to buyer (only if NOT already sent)
 *
 * Returns a result object so callers can decide what to surface to the user.
 */

export interface ApplyRefundOptions {
  /** Reason text from the admin (optional, included in email + DB). */
  reason?: string | null;
  /** Auth user ID of the admin who triggered (null = webhook-initiated). */
  adminUserId?: string | null;
  /**
   * Set to true when called from a webhook to avoid re-sending an email if
   * the same refund was already initiated via our UI within this same flow.
   * The shared idempotency on metadata.refund_email_sent handles cross-call
   * dedup; this is just a hint.
   */
  source: "admin_ui" | "webhook";
}

export interface ApplyRefundResult {
  /** True if this call did the work; false if another caller already did. */
  applied: boolean;
  /** Refund email actually sent (false if disabled, already sent, or send failed). */
  email_sent: boolean;
  /** Rep attribution reversal info for the response, if applicable. */
  rep_reversal:
    | { repName: string; pointsDeducted: number }
    | null;
}

export async function applyRefundSideEffects(
  orderId: string,
  orgId: string,
  options: ApplyRefundOptions,
): Promise<ApplyRefundResult> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Database not configured");
  }

  // 1) Fetch the order — scoped to org_id.
  const { data: order, error: orderErr } = await supabase
    .from(TABLES.ORDERS)
    .select(
      "id, status, customer_id, event_id, total, currency, order_number, refund_reason, metadata, order_items:order_items(ticket_type_id, qty)",
    )
    .eq("id", orderId)
    .eq("org_id", orgId)
    .single();

  if (orderErr || !order) {
    throw new Error("Order not found");
  }

  if (order.status === "refunded") {
    return {
      applied: false,
      email_sent: false,
      rep_reversal: null,
    };
  }

  const now = new Date().toISOString();
  const existingMeta =
    (order.metadata as Record<string, unknown>) || {};
  const mergedMetadata: Record<string, unknown> = {
    ...existingMeta,
    refunded_at: now,
    refund_source: options.source,
  };

  // 2) Atomic status flip — guards concurrent callers.
  // refunded_by lives in its own column now (see migration
  // 20260426_add_orders_refunded_by_column.sql) for clean reporting; we
  // still mirror refunded_at and refund_source in metadata for callers
  // that look there.
  const { data: flipped, error: flipErr } = await supabase
    .from(TABLES.ORDERS)
    .update({
      status: "refunded",
      refund_reason: options.reason ?? order.refund_reason ?? null,
      refunded_at: now,
      refunded_by: options.adminUserId ?? null,
      updated_at: now,
      metadata: mergedMetadata,
    })
    .eq("id", orderId)
    .eq("org_id", orgId)
    .neq("status", "refunded")
    .select("id")
    .single();

  if (flipErr) {
    Sentry.captureException(flipErr);
    throw new Error(
      `Order status update failed: ${flipErr.message || "unknown"}`,
    );
  }

  if (!flipped) {
    // Lost the race — another caller already flipped. No side effects to run.
    return {
      applied: false,
      email_sent: false,
      rep_reversal: null,
    };
  }

  // 3) Cancel all tickets.
  const { error: ticketsErr } = await supabase
    .from(TABLES.TICKETS)
    .update({ status: "cancelled" })
    .eq("order_id", orderId)
    .eq("org_id", orgId);
  if (ticketsErr) {
    Sentry.captureException(ticketsErr);
    throw new Error(
      `Ticket cancellation failed: ${ticketsErr.message || "unknown"}`,
    );
  }

  // 4) Decrement sold counts atomically.
  for (const item of (order.order_items as
    | { ticket_type_id: string; qty: number }[]
    | null) || []) {
    const { error: decErr } = await supabase.rpc("decrement_sold", {
      p_ticket_type_id: item.ticket_type_id,
      p_qty: item.qty,
    });
    if (decErr) {
      // Non-blocking: money is back, tickets cancelled. Stale sold count
      // gets reconciled by ops if needed. Don't fail the whole refund.
      Sentry.captureException(decErr);
      console.error("[refund] decrement_sold RPC failed:", decErr);
    }
  }

  // 5) Decrement discount used_count if a discount was applied.
  // Discount info lives on order.metadata.discount_code (set by
  // /api/stripe/payment-intent at order creation).
  const discountCode = (existingMeta.discount_code as string) || undefined;
  if (discountCode) {
    const { error: discErr } = await supabase.rpc(
      "decrement_discount_used",
      { p_code: discountCode, p_org_id: orgId },
    );
    if (discErr) {
      Sentry.captureException(discErr);
      console.error(
        "[refund] decrement_discount_used RPC failed:",
        discErr,
      );
    }
  }

  // 6) Recompute customer stats from non-refunded orders.
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

  // 7) Reverse rep attribution (non-blocking).
  let repReversal: { repName: string; pointsDeducted: number } | null = null;
  try {
    const result = await reverseRepAttribution({ orderId });
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

  // 8) Send the refund email — non-blocking.
  let emailSent = false;
  try {
    const customer = order.customer_id
      ? (
          await supabase
            .from(TABLES.CUSTOMERS)
            .select("first_name, last_name, email")
            .eq("id", order.customer_id)
            .eq("org_id", orgId)
            .single()
        ).data
      : null;

    if (customer?.email) {
      const event = order.event_id
        ? (
            await supabase
              .from(TABLES.EVENTS)
              .select("name, venue_name")
              .eq("id", order.event_id)
              .eq("org_id", orgId)
              .single()
          ).data
        : null;

      emailSent = await sendOrderRefundEmail({
        orgId,
        order: {
          order_number: order.order_number,
          total: Number(order.total || 0),
          currency: order.currency || "GBP",
        },
        customer,
        event: event ? { name: event.name, venue_name: event.venue_name || undefined } : null,
        reason: options.reason ?? null,
      });

      // Mark email sent in metadata so a duplicate webhook won't re-send.
      if (emailSent) {
        await supabase
          .from(TABLES.ORDERS)
          .update({
            metadata: { ...mergedMetadata, refund_email_sent: true },
          })
          .eq("id", orderId)
          .eq("org_id", orgId);
      }
    }
  } catch (err) {
    console.error("[refund] Email send failed (non-blocking):", err);
  }

  return {
    applied: true,
    email_sent: emailSent,
    rep_reversal: repReversal,
  };
}
