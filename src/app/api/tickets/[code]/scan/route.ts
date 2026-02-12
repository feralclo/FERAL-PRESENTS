import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/tickets/[code]/scan — Mark a ticket as scanned.
 * Prevents double-scanning. Returns scan details if already used.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const { scanned_by, scan_location } = body as {
      scanned_by?: string;
      scan_location?: string;
    };

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
        "*, ticket_type:ticket_types(name), event:events(name, slug, venue_name, date_start)"
      )
      .eq("ticket_code", code)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        {
          success: false,
          error: "Ticket not found",
          status: "invalid",
        },
        { status: 404 }
      );
    }

    // Check if already scanned
    if (ticket.status === "used") {
      return NextResponse.json(
        {
          success: false,
          error: "Ticket already scanned",
          status: "already_used",
          scanned_at: ticket.scanned_at,
          scanned_by: ticket.scanned_by,
          ticket: {
            ticket_code: ticket.ticket_code,
            holder_first_name: ticket.holder_first_name,
            holder_last_name: ticket.holder_last_name,
            ticket_type: ticket.ticket_type,
            event: ticket.event,
          },
        },
        { status: 409 }
      );
    }

    // Check if cancelled/expired
    if (ticket.status !== "valid") {
      return NextResponse.json(
        {
          success: false,
          error: `Ticket is ${ticket.status}`,
          status: ticket.status,
        },
        { status: 400 }
      );
    }

    // Mark as scanned
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from(TABLES.TICKETS)
      .update({
        status: "used",
        scanned_at: now,
        scanned_by: scanned_by || "scanner",
        scan_location: scan_location || null,
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
      status: "valid",
      ticket: {
        ticket_code: ticket.ticket_code,
        holder_first_name: ticket.holder_first_name,
        holder_last_name: ticket.holder_last_name,
        holder_email: ticket.holder_email,
        merch_size: ticket.merch_size,
        merch_collected: ticket.merch_collected || false,
        ticket_type: ticket.ticket_type,
        event: ticket.event,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
