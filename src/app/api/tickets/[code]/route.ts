import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * GET /api/tickets/[code] — Validate a ticket by its code.
 * Used by the scanner PWA and for QR code validation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data: ticket, error } = await supabase
      .from(TABLES.TICKETS)
      .select(
        "*, ticket_type:ticket_types(name, description), event:events(id, name, slug, venue_name, date_start)"
      )
      .eq("ticket_code", code)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        { error: "Ticket not found", valid: false },
        { status: 404 }
      );
    }

    const isValid = ticket.status === "valid";

    return NextResponse.json({
      valid: isValid,
      ticket: {
        id: ticket.id,
        ticket_code: ticket.ticket_code,
        status: ticket.status,
        holder_first_name: ticket.holder_first_name,
        holder_last_name: ticket.holder_last_name,
        holder_email: ticket.holder_email,
        merch_size: ticket.merch_size,
        scanned_at: ticket.scanned_at,
        scanned_by: ticket.scanned_by,
        ticket_type: ticket.ticket_type,
        event: ticket.event,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
