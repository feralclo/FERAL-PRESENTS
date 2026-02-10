import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://feralpresents.com";

/**
 * GET /api/orders/export?event_id=xxx&status=completed
 * Export orders as CSV with full ticket details, QR codes, and customer info.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");
    const status = searchParams.get("status");

    // Fetch orders with all related data
    let query = supabase
      .from(TABLES.ORDERS)
      .select(
        "*, customer:customers(email, first_name, last_name, phone), event:events(name, slug, date_start, venue_name, city), order_items:order_items(qty, unit_price, merch_size, ticket_type:ticket_types(name)), tickets:tickets(ticket_code, status, holder_first_name, holder_last_name, holder_email, merch_size, scanned_at)"
      )
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false });

    if (eventId) query = query.eq("event_id", eventId);
    if (status) query = query.eq("status", status);

    const { data: orders, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return new NextResponse("No orders found", { status: 404 });
    }

    // Build CSV rows — one row per ticket
    const headers = [
      "Order Number",
      "Order Date",
      "Order Status",
      "Event Name",
      "Event Date",
      "Venue",
      "Customer First Name",
      "Customer Last Name",
      "Customer Email",
      "Customer Phone",
      "Ticket Type",
      "Ticket Code (QR Value)",
      "Ticket Status",
      "Validation API URL",
      "Merch Size",
      "Scanned At",
      "Unit Price",
      "Order Total",
      "Currency",
      "Payment Method",
      "Payment Ref",
    ];

    const rows: string[][] = [];

    for (const order of orders) {
      const customer = order.customer as {
        email: string;
        first_name: string;
        last_name: string;
        phone?: string;
      } | null;
      const event = order.event as {
        name: string;
        slug: string;
        date_start: string;
        venue_name?: string;
        city?: string;
      } | null;
      const tickets = (order.tickets || []) as {
        ticket_code: string;
        status: string;
        holder_first_name: string;
        holder_last_name: string;
        holder_email: string;
        merch_size?: string;
        scanned_at?: string;
      }[];
      const orderItems = (order.order_items || []) as {
        qty: number;
        unit_price: number;
        merch_size?: string;
        ticket_type: { name: string } | null;
      }[];

      // Build a map of ticket type names from order items
      const ticketTypeNames = orderItems.map(
        (oi) => oi.ticket_type?.name || "Ticket"
      );

      if (tickets.length === 0) {
        // Order with no tickets yet (edge case)
        rows.push([
          order.order_number,
          new Date(order.created_at).toISOString(),
          order.status,
          event?.name || "",
          event?.date_start
            ? new Date(event.date_start).toLocaleDateString("en-GB")
            : "",
          [event?.venue_name, event?.city].filter(Boolean).join(", "),
          customer?.first_name || "",
          customer?.last_name || "",
          customer?.email || "",
          customer?.phone || "",
          ticketTypeNames.join(", "),
          "",
          "",
          "",
          "",
          "",
          orderItems
            .map((oi) => Number(oi.unit_price).toFixed(2))
            .join(", "),
          Number(order.total).toFixed(2),
          order.currency,
          order.payment_method,
          order.payment_ref || "",
        ]);
      } else {
        // One row per ticket
        for (const ticket of tickets) {
          rows.push([
            order.order_number,
            new Date(order.created_at).toISOString(),
            order.status,
            event?.name || "",
            event?.date_start
              ? new Date(event.date_start).toLocaleDateString("en-GB")
              : "",
            [event?.venue_name, event?.city].filter(Boolean).join(", "),
            customer?.first_name || "",
            customer?.last_name || "",
            customer?.email || "",
            customer?.phone || "",
            ticketTypeNames[0] || "Ticket",
            ticket.ticket_code,
            ticket.status,
            `${BASE_URL}/api/tickets/${ticket.ticket_code}`,
            ticket.merch_size || "",
            ticket.scanned_at || "",
            orderItems.length > 0
              ? Number(orderItems[0].unit_price).toFixed(2)
              : "",
            Number(order.total).toFixed(2),
            order.currency,
            order.payment_method,
            order.payment_ref || "",
          ]);
        }
      }
    }

    // Build CSV string
    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Return as downloadable CSV
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="orders-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
