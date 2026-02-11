import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * POST /api/tickets/[code]/merch — Mark merchandise as collected.
 * Same QR code as entry scan, different endpoint for merch desk.
 * Independent of entry scan (merch can be collected before or after door scan).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { collected_by } = body as { collected_by?: string };

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch ticket
    const { data: ticket, error } = await supabase
      .from(TABLES.TICKETS)
      .select(
        "*, ticket_type:ticket_types(name), event:events(name, slug)"
      )
      .eq("ticket_code", code)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    // Check ticket has merch
    if (!ticket.merch_size) {
      return NextResponse.json(
        { success: false, error: "This ticket does not include merchandise" },
        { status: 400 }
      );
    }

    // Check cancelled/expired
    if (ticket.status === "cancelled" || ticket.status === "expired") {
      return NextResponse.json(
        { success: false, error: `Ticket is ${ticket.status}` },
        { status: 400 }
      );
    }

    // Check if already collected
    if (ticket.merch_collected) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchandise already collected",
          merch_size: ticket.merch_size,
          collected_at: ticket.merch_collected_at,
          collected_by: ticket.merch_collected_by,
        },
        { status: 409 }
      );
    }

    // Mark as collected
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from(TABLES.TICKETS)
      .update({
        merch_collected: true,
        merch_collected_at: now,
        merch_collected_by: collected_by || "merch_desk",
      })
      .eq("id", ticket.id)
      .eq("org_id", ORG_ID);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: "Failed to update ticket" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      merch_size: ticket.merch_size,
      ticket: {
        ticket_code: ticket.ticket_code,
        holder_first_name: ticket.holder_first_name,
        holder_last_name: ticket.holder_last_name,
        ticket_type: ticket.ticket_type,
        event: ticket.event,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
