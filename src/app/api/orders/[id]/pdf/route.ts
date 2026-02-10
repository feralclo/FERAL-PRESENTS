import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { generateTicketsPDF, type TicketPDFData } from "@/lib/pdf";

/**
 * GET /api/orders/[id]/pdf — Generate and download PDF tickets for an order
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch order with tickets and event
    const { data: order, error } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "*, event:events(name, venue_name, date_start), tickets:tickets(*, ticket_type:ticket_types(name))"
      )
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (!order.tickets || order.tickets.length === 0) {
      return NextResponse.json(
        { error: "No tickets found for this order" },
        { status: 400 }
      );
    }

    // Format event date
    const eventDate = order.event?.date_start
      ? new Date(order.event.date_start).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "TBC";

    // Build PDF data
    const ticketData: TicketPDFData[] = order.tickets.map(
      (ticket: {
        ticket_code: string;
        holder_first_name?: string;
        holder_last_name?: string;
        merch_size?: string;
        ticket_type?: { name: string };
      }) => ({
        ticketCode: ticket.ticket_code,
        eventName: order.event?.name || "FERAL Event",
        eventDate,
        venueName: order.event?.venue_name || "",
        ticketType: ticket.ticket_type?.name || "Ticket",
        holderName: [ticket.holder_first_name, ticket.holder_last_name]
          .filter(Boolean)
          .join(" "),
        orderNumber: order.order_number,
        merchSize: ticket.merch_size,
      })
    );

    const pdfBuffer = await generateTicketsPDF(ticketData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${order.order_number}-tickets.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
