import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { sendOrderConfirmationEmail } from "@/lib/email";

/**
 * POST /api/orders/[id]/resend-email — Resend order confirmation email
 *
 * Re-triggers the order confirmation email for a completed order.
 * Can be used regardless of whether the original email succeeded or failed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch full order with customer, event, tickets
    const { data: order, error: orderErr } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "id, order_number, total, currency, status, customer:customers(id, email, first_name, last_name), event:events(id, name, slug, currency, venue_name, date_start, doors_time), tickets:tickets(id, ticket_code, ticket_type_id, merch_size, ticket_type:ticket_types(name, merch_name, product:products(name)))"
      )
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const customer = order.customer as unknown as { id: string; email: string; first_name: string; last_name: string } | null;
    const event = order.event as unknown as { id: string; name: string; slug: string; currency: string; venue_name: string; date_start: string; doors_time: string } | null;
    const tickets = (order.tickets || []) as unknown as { id: string; ticket_code: string; ticket_type_id: string; merch_size?: string; ticket_type: { name: string; merch_name?: string; product?: { name: string } | null } | null }[];

    if (!customer?.email) {
      return NextResponse.json(
        { error: "No customer email on this order" },
        { status: 400 }
      );
    }

    if (!event) {
      return NextResponse.json(
        { error: "No event linked to this order" },
        { status: 400 }
      );
    }

    // Send the email (awaited, not fire-and-forget — we want to report the result)
    await sendOrderConfirmationEmail({
      orgId: ORG_ID,
      order: {
        id: order.id,
        order_number: order.order_number,
        total: Number(order.total),
        currency: (event.currency || order.currency || "GBP").toUpperCase(),
      },
      customer: {
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
      },
      event: {
        name: event.name,
        slug: event.slug,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
        currency: event.currency,
      },
      tickets: tickets.map((t) => ({
        ticket_code: t.ticket_code,
        ticket_type_name: t.ticket_type?.name || "Ticket",
        merch_size: t.merch_size,
        merch_name: t.merch_size
          ? t.ticket_type?.product?.name || t.ticket_type?.merch_name || undefined
          : undefined,
      })),
    });

    // Check the updated order metadata to see if it succeeded
    const { data: updated } = await supabase
      .from(TABLES.ORDERS)
      .select("metadata")
      .eq("id", id)
      .single();

    const meta = (updated?.metadata || {}) as Record<string, unknown>;

    if (meta.email_sent === true) {
      return NextResponse.json({
        success: true,
        message: `Order confirmation resent to ${customer.email}`,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: (meta.email_error as string) || "Email send failed — check Resend configuration",
      },
      { status: 502 }
    );
  } catch (err) {
    console.error("[resend-email] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
