import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/orders/[id]/refund — Mark order as refunded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch order with items
    const { data: order, error: orderErr } = await supabase
      .from(TABLES.ORDERS)
      .select("*, order_items:order_items(ticket_type_id, qty)")
      .eq("id", id)
      .eq("org_id", ORG_ID)
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
      .eq("id", id);

    // Cancel all tickets for this order
    await supabase
      .from(TABLES.TICKETS)
      .update({ status: "cancelled" })
      .eq("order_id", id)
      .eq("org_id", ORG_ID);

    // Decrement sold counts on ticket types
    for (const item of order.order_items as {
      ticket_type_id: string;
      qty: number;
    }[]) {
      const { data: tt } = await supabase
        .from(TABLES.TICKET_TYPES)
        .select("sold")
        .eq("id", item.ticket_type_id)
        .single();

      if (tt) {
        await supabase
          .from(TABLES.TICKET_TYPES)
          .update({
            sold: Math.max(0, tt.sold - item.qty),
            updated_at: now,
          })
          .eq("id", item.ticket_type_id);
      }
    }

    // Update customer stats
    const { data: custOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("total")
      .eq("customer_id", order.customer_id)
      .eq("org_id", ORG_ID)
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
        .eq("id", order.customer_id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
