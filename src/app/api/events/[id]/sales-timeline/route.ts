import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { densifyBuckets, type SalesBucket } from "@/lib/sales-velocity";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/events/:id/sales-timeline
 *
 * Returns per-day per-ticket-type sale buckets for one event, scoped by the
 * caller's org. Powers the admin Sales Timeline card and the Release
 * Strategy panel's time-to-unlock estimates.
 *
 * Response shape (compact on purpose — the client folds via lib/sales-velocity):
 *   {
 *     buckets: { date: "YYYY-MM-DD", perTicket: { [ticketTypeId]: { qty, revenue } } }[],
 *     ticketTypes: { id, name, sold, capacity, sort_order }[],
 *     currency: "GBP",
 *     generatedAt: ISO timestamp
 *   }
 *
 * `from` / `to` are optional ISO date filters. Default window is the full
 * lifetime of the event's order_items.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id: eventId } = await context.params;
    if (!eventId) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Verify the caller's org owns this event before reading order data.
    const { data: ev, error: evErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, currency, org_id")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();
    if (evErr || !ev) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Pull the event's ticket types so the client can render labelled series
    // even for tiers that haven't sold yet.
    const { data: ticketTypeRows } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("id, name, sold, capacity, sort_order")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });

    const ticketTypes = (ticketTypeRows || []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      sold: Number(r.sold ?? 0),
      capacity:
        r.capacity == null ? null : Number(r.capacity),
      sort_order: Number(r.sort_order ?? 0),
    }));

    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Pull order_items joined with completed orders for this event. Refunded
    // and cancelled orders are excluded — the timeline shows kept revenue,
    // not gross.
    let orderQuery = supabase
      .from(TABLES.ORDER_ITEMS)
      .select(
        "qty, unit_price, ticket_type_id, created_at, order:orders!inner(id, event_id, status, currency)"
      )
      .eq("org_id", orgId)
      .eq("order.event_id", eventId)
      .eq("order.status", "completed");

    if (from) orderQuery = orderQuery.gte("created_at", from);
    if (to) orderQuery = orderQuery.lte("created_at", to);

    const { data: itemRows, error: itemErr } = await orderQuery;
    if (itemErr) {
      return NextResponse.json(
        { error: itemErr.message },
        { status: 500 }
      );
    }

    // Bucket items by UTC date string + ticket_type_id.
    const bucketMap = new Map<string, SalesBucket>();
    for (const row of itemRows || []) {
      // Skip items not tied to a ticket type (merch-only orders aren't
      // relevant here — this is the *ticket* timeline).
      if (!row.ticket_type_id) continue;
      const date = String(row.created_at).slice(0, 10);
      let bucket = bucketMap.get(date);
      if (!bucket) {
        bucket = { date, perTicket: {} };
        bucketMap.set(date, bucket);
      }
      const id = row.ticket_type_id as string;
      const qty = Number(row.qty ?? 0);
      const unit = Number(row.unit_price ?? 0);
      const existing = bucket.perTicket[id];
      if (existing) {
        existing.qty += qty;
        existing.revenue += qty * unit;
      } else {
        bucket.perTicket[id] = { qty, revenue: qty * unit };
      }
    }

    const sparseBuckets = Array.from(bucketMap.values()).sort((a, b) =>
      a.date < b.date ? -1 : 1
    );
    const buckets = densifyBuckets(sparseBuckets);

    return NextResponse.json({
      buckets,
      ticketTypes,
      currency: (ev.currency as string) || "GBP",
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
