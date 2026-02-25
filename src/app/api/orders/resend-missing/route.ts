import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePlatformOwner } from "@/lib/auth";
import { sendOrderConfirmationEmail } from "@/lib/email";

/**
 * POST /api/orders/resend-missing
 *
 * One-time recovery endpoint: resends order confirmation emails for all
 * orders that never received them (metadata.email_sent is not true).
 *
 * Gated by requirePlatformOwner() — only the platform owner can trigger this.
 * DELETE THIS ROUTE after the recovery is complete.
 */
export async function POST() {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Find all completed orders where email was never sent
    const { data: orders, error: fetchErr } = await supabase
      .from("orders")
      .select(
        "id, order_number, total, currency, org_id, metadata, customer:customers(id, email, first_name, last_name), event:events(id, name, slug, currency, venue_name, date_start, doors_time), tickets:tickets(id, ticket_code, ticket_type_id, merch_size, ticket_type:ticket_types(name, merch_name, product:products(name)))"
      )
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    if (fetchErr || !orders) {
      return NextResponse.json({ error: "Failed to fetch orders", details: fetchErr?.message }, { status: 500 });
    }

    // Filter to orders missing email confirmation
    const missing = orders.filter((o) => {
      const meta = (o.metadata || {}) as Record<string, unknown>;
      return meta.email_sent !== true;
    });

    const results: { order_number: string; email: string; status: string }[] = [];

    for (const order of missing) {
      const customer = order.customer as unknown as {
        email: string; first_name: string; last_name: string;
      } | null;
      const event = order.event as unknown as {
        id: string; name: string; slug: string; currency: string;
        venue_name: string; date_start: string; doors_time: string;
      } | null;
      const tickets = (order.tickets || []) as unknown as {
        ticket_code: string; merch_size?: string;
        ticket_type?: { name?: string; merch_name?: string; product?: { name?: string } | null } | null;
      }[];

      if (!customer?.email || !event) {
        results.push({ order_number: order.order_number, email: "N/A", status: "skipped — missing data" });
        continue;
      }

      try {
        await sendOrderConfirmationEmail({
          orgId: order.org_id,
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

        // Verify
        const { data: updated } = await supabase
          .from("orders")
          .select("metadata")
          .eq("id", order.id)
          .single();
        const meta = (updated?.metadata || {}) as Record<string, unknown>;

        if (meta.email_sent === true) {
          results.push({ order_number: order.order_number, email: customer.email, status: "sent" });
        } else {
          results.push({ order_number: order.order_number, email: customer.email, status: `failed: ${meta.email_error || "unknown"}` });
        }
      } catch (err) {
        results.push({
          order_number: order.order_number,
          email: customer.email,
          status: `error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    return NextResponse.json({
      total_missing: missing.length,
      sent: sentCount,
      failed: missing.length - sentCount,
      results,
    });
  } catch (err) {
    console.error("[resend-missing] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
