import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/scanner/events — List events with scan stats for the scanner app.
 * Requires admin auth with perm_orders.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Check perm_orders
    const { data: orgUser } = await supabase
      .from(TABLES.ORG_USERS)
      .select("perm_orders")
      .eq("auth_user_id", auth.user.id)
      .eq("org_id", orgId)
      .eq("status", "active")
      .single();

    if (!orgUser?.perm_orders) {
      return NextResponse.json(
        { error: "Scanner access requires order management permission" },
        { status: 403 }
      );
    }

    // Fetch events (active + past 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, venue_name, date_start, doors_time, status, cover_image")
      .eq("org_id", orgId)
      .in("status", ["published", "live", "completed"])
      .gte("date_start", sevenDaysAgo)
      .order("date_start", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get scan stats for each event
    const eventsWithStats = await Promise.all(
      (events || []).map(async (event) => {
        // Total tickets + scanned count
        const { data: tickets } = await supabase
          .from(TABLES.TICKETS)
          .select("status, merch_size, merch_collected")
          .eq("org_id", orgId)
          .eq("event_id", event.id)
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
          .eq("event_id", event.id);

        const guests = guestList || [];
        const guest_list_total = guests.reduce((sum, g) => sum + (g.qty || 1), 0);
        const guest_list_checked_in = guests.filter((g) => g.checked_in).length;

        return {
          ...event,
          stats: {
            total_tickets,
            scanned,
            merch_total,
            merch_collected,
            guest_list_total,
            guest_list_checked_in,
          },
        };
      })
    );

    return NextResponse.json({ events: eventsWithStats });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
