import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/tickets/[code] — Validate a ticket by its code.
 * Used by the scanner PWA and for QR code validation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { code } = await params;
    const supabase = await getSupabaseAdmin();
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
        merch_collected: ticket.merch_collected || false,
        merch_collected_at: ticket.merch_collected_at || null,
        merch_collected_by: ticket.merch_collected_by || null,
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
