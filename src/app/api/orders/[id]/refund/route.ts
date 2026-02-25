import { NextRequest, NextResponse } from "next/server";
import { getStripe, verifyConnectedAccount } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { reverseRepAttribution } from "@/lib/rep-attribution";

/**
 * POST /api/orders/[id]/refund — Refund an order via Stripe + update database.
 *
 * Flow:
 * 1. Verify admin auth
 * 2. Fetch order + determine which Stripe account the charge was on
 * 3. Issue full refund via Stripe API
 * 4. Mark order as refunded, cancel tickets, decrement sold counts
 * 5. Update customer stats
 *
 * If the order has no payment_ref (e.g., test/manual order), the database
 * is updated without calling Stripe.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch order with items and event (need event for Stripe account lookup)
    const { data: order, error: orderErr } = await supabase
      .from(TABLES.ORDERS)
      .select("*, order_items:order_items(ticket_type_id, qty)")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.status === "refunded") {
      return NextResponse.json(
        { error: "Order already refunded" },
        { status: 400 }
      );
    }

    // Issue Stripe refund if this is a Stripe payment
    if (order.payment_ref && order.payment_method === "stripe") {
      const stripe = getStripe();

      // Determine which Stripe account the charge was made on.
      // Priority: event-level stripe_account_id → global setting → platform account
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

      // Validate the connected account is accessible before refunding
      stripeAccountId = await verifyConnectedAccount(stripeAccountId);

      try {
        // Full refund of the PaymentIntent
        await stripe.refunds.create(
          {
            payment_intent: order.payment_ref,
            reason: "requested_by_customer",
          },
          stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
        );
      } catch (stripeErr) {
        // If Stripe says it's already refunded, continue with DB update.
        // Otherwise, stop and report the error.
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        if (!msg.includes("already been refunded")) {
          console.error("Stripe refund failed:", msg);
          return NextResponse.json(
            { error: `Stripe refund failed: ${msg}` },
            { status: 502 }
          );
        }
      }
    }

    const now = new Date().toISOString();

    // Update order status
    await supabase
      .from(TABLES.ORDERS)
      .update({
        status: "refunded",
        refund_reason: reason || null,
        refunded_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("org_id", orgId);

    // Cancel all tickets for this order
    await supabase
      .from(TABLES.TICKETS)
      .update({ status: "cancelled" })
      .eq("order_id", id)
      .eq("org_id", orgId);

    // Decrement sold counts on ticket types
    for (const item of order.order_items as {
      ticket_type_id: string;
      qty: number;
    }[]) {
      const { data: tt } = await supabase
        .from(TABLES.TICKET_TYPES)
        .select("sold")
        .eq("id", item.ticket_type_id)
        .eq("org_id", orgId)
        .single();

      if (tt) {
        await supabase
          .from(TABLES.TICKET_TYPES)
          .update({
            sold: Math.max(0, tt.sold - item.qty),
            updated_at: now,
          })
          .eq("id", item.ticket_type_id)
          .eq("org_id", orgId);
      }
    }

    // Update customer stats
    const { data: custOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("total")
      .eq("customer_id", order.customer_id)
      .eq("org_id", orgId)
      .eq("status", "completed");

    if (custOrders) {
      const totalSpent = custOrders.reduce(
        (sum: number, o: { total: number }) => sum + Number(o.total),
        0
      );
      await supabase
        .from(TABLES.CUSTOMERS)
        .update({
          total_orders: custOrders.length,
          total_spent: totalSpent,
          updated_at: now,
        })
        .eq("id", order.customer_id)
        .eq("org_id", orgId);
    }

    // Reverse rep attribution (fire-and-forget — refund succeeds even if this fails)
    let repReversal: { repName: string; pointsDeducted: number } | null = null;
    try {
      const result = await reverseRepAttribution({ orderId: id });
      if (result) {
        repReversal = { repName: result.repName, pointsDeducted: result.pointsDeducted };
      }
    } catch (err) {
      console.error("[refund] Rep attribution reversal failed (non-blocking):", err);
    }

    return NextResponse.json({
      success: true,
      rep_reversal: repReversal,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
