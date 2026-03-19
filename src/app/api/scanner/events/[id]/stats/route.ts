import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/scanner/events/[id]/stats — Live scan stats for a specific event.
 * Polled every 30s by the scanner view for real-time progress.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id: eventId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Get event name
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("name")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();

    // Total tickets + scanned count
    const { data: tickets } = await supabase
      .from(TABLES.TICKETS)
      .select("status, merch_size, merch_collected")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .in("status", ["valid", "used"]);

    const ticketList = tickets || [];
    const total_tickets = ticketList.length;
    const scanned = ticketList.filter((t) => t.status === "used").length;
    const merchTickets = ticketList.filter((t) => t.merch_size);
    const merch_total = merchTickets.length;
    const merch_collected = merchTickets.filter((t) => t.merch_collected).length;

    // Guest list stats
    const { data: guestList } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("checked_in, qty")
      .eq("org_id", orgId)
      .eq("event_id", eventId);

    const guests = guestList || [];
    const guest_list_total = guests.reduce((sum, g) => sum + (g.qty || 1), 0);
    const guest_list_checked_in = guests.filter((g) => g.checked_in).length;

    return NextResponse.json({
      event_name: event?.name || null,
      stats: {
        total_tickets,
        scanned,
        merch_total,
        merch_collected,
        guest_list_total,
        guest_list_checked_in,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
