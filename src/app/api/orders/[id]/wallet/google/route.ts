import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { generateGoogleWalletUrl, type WalletPassTicketData } from "@/lib/wallet-passes";
import type { WalletPassSettings } from "@/types/email";
import { DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";

/**
 * GET /api/orders/[id]/wallet/google — Get Google Wallet "Save" URL for an order
 *
 * PUBLIC endpoint — linked from confirmation email.
 * Returns a JSON response with the Google Wallet save URL.
 *
 * The URL contains a signed JWT with all ticket pass objects inline.
 * Google validates the JWT when the customer clicks — no pre-registration needed.
 *
 * CRITICAL: The barcode value in each pass is the raw ticket code — identical
 * to the PDF and email QR codes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch wallet pass settings
    let walletSettings: WalletPassSettings = { ...DEFAULT_WALLET_PASS_SETTINGS };
    try {
      const { data: settingsRow } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `${ORG_ID}_wallet_passes`)
        .single();
      if (settingsRow?.data && typeof settingsRow.data === "object") {
        walletSettings = { ...DEFAULT_WALLET_PASS_SETTINGS, ...(settingsRow.data as Partial<WalletPassSettings>) };
      }
    } catch { /* use defaults */ }

    if (!walletSettings.google_wallet_enabled) {
      return NextResponse.json({ error: "Google Wallet passes are not enabled" }, { status: 404 });
    }

    // Fetch order with tickets and event
    const { data: order, error } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "*, event:events(name, venue_name, date_start, doors_time), tickets:tickets(*, ticket_type:ticket_types(name, includes_merch, merch_name))"
      )
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.tickets || order.tickets.length === 0) {
      return NextResponse.json({ error: "No tickets found" }, { status: 400 });
    }

    // Build wallet pass data for each ticket
    const ticketData: WalletPassTicketData[] = order.tickets.map(
      (ticket: {
        ticket_code: string;
        holder_first_name?: string;
        holder_last_name?: string;
        merch_size?: string;
        ticket_type?: { name: string; includes_merch?: boolean; merch_name?: string };
      }) => ({
        ticketCode: ticket.ticket_code,
        eventName: order.event?.name || "Event",
        venueName: order.event?.venue_name || "",
        eventDate: order.event?.date_start || "",
        doorsTime: order.event?.doors_time,
        ticketType: ticket.ticket_type?.name || "Ticket",
        holderName: [ticket.holder_first_name, ticket.holder_last_name]
          .filter(Boolean)
          .join(" ") || undefined,
        orderNumber: order.order_number,
        merchSize: ticket.merch_size,
        includesMerch: ticket.ticket_type?.includes_merch,
        merchName: ticket.ticket_type?.merch_name,
        currency: order.currency,
      })
    );

    const url = generateGoogleWalletUrl(ticketData, walletSettings);
    if (!url) {
      return NextResponse.json(
        { error: "Google Wallet is not configured. Contact the event organiser." },
        { status: 503 }
      );
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[wallet/google] Error generating URL:", err);
    return NextResponse.json({ error: "Failed to generate Google Wallet link" }, { status: 500 });
  }
}
