import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, scannerLiveTokensKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

interface LiveScanToken {
  token: string;
  event_id: string;
  event_name: string;
}

/** Validate a live scanner token → returns org_id and event_id. */
async function validateToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  token: string
): Promise<{ orgId: string; eventId: string } | null> {
  // Scan all *_scanner_live_tokens keys
  const { data: rows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .like("key", "%_scanner_live_tokens");

  if (!rows) return null;

  for (const row of rows) {
    const tokens = row.data as LiveScanToken[];
    if (!Array.isArray(tokens)) continue;
    const match = tokens.find((t: LiveScanToken) => t.token === token);
    if (match) {
      // Extract org_id from key (e.g. "feral_scanner_live_tokens" → "feral")
      const orgId = row.key.replace("_scanner_live_tokens", "");
      return { orgId, eventId: match.event_id };
    }
  }
  return null;
}

/**
 * POST /api/scanner/live/scan — Public ticket scan endpoint (token-based auth).
 * Used by the no-login live scanner for door staff.
 */
export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let body: { token?: string; ticket_code?: string; scanned_by?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.token || !body.ticket_code) {
      return NextResponse.json({ error: "Missing token or ticket_code" }, { status: 400 });
    }

    // Validate token
    const auth = await validateToken(supabase, body.token);
    if (!auth) {
      return NextResponse.json({ error: "Invalid scanner token" }, { status: 403 });
    }

    const { orgId, eventId } = auth;
    const code = body.ticket_code.trim();

    // Fetch ticket
    const { data: ticket, error } = await supabase
      .from(TABLES.TICKETS)
      .select(
        "*, ticket_type:ticket_types(name), event:events(name, slug, venue_name, date_start), order:orders(order_number)"
      )
      .eq("ticket_code", code)
      .eq("org_id", orgId)
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found", status: "invalid" },
        { status: 404 }
      );
    }

    // Validate ticket belongs to the expected event
    if (ticket.event_id !== eventId) {
      return NextResponse.json(
        { success: false, error: "This ticket is for a different event", status: "wrong_event" },
        { status: 400 }
      );
    }

    // Reject merch-only passes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticketTypeName = (ticket.ticket_type as any)?.name || "";
    if (ticketTypeName === "Merch Pre-order") {
      return NextResponse.json(
        {
          success: false,
          error: "This is a merch collection QR code, not an entry ticket. Direct to the merch stand.",
          status: "merch_only",
          ticket: {
            ticket_code: ticket.ticket_code,
            holder_first_name: ticket.holder_first_name,
            holder_last_name: ticket.holder_last_name,
            merch_size: ticket.merch_size,
            ticket_type: ticket.ticket_type,
            event: ticket.event,
            order: ticket.order,
          },
        },
        { status: 400 }
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
            order: ticket.order,
          },
        },
        { status: 409 }
      );
    }

    // Check if cancelled/expired
    if (ticket.status !== "valid") {
      return NextResponse.json(
        { success: false, error: `Ticket is ${ticket.status}`, status: ticket.status },
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
        scanned_by: body.scanned_by || "live-scanner",
        scan_location: "door",
      })
      .eq("id", ticket.id)
      .eq("org_id", orgId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: "Failed to update ticket" },
        { status: 500 }
      );
    }

    // Sync guest list check-in
    if (ticketTypeName.startsWith("Guest List")) {
      void supabase
        .from(TABLES.GUEST_LIST)
        .update({ checked_in: true, checked_in_at: now, checked_in_count: 1 })
        .eq("order_id", ticket.order_id)
        .eq("org_id", orgId)
        .then(() => {});
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
        order: ticket.order,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
