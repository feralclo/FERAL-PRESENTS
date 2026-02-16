import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { createOrder, OrderCreationError } from "@/lib/orders";

/**
 * GET /api/orders — List orders with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");
    const status = searchParams.get("status");
    const paymentRef = searchParams.get("payment_ref");
    const customerId = searchParams.get("customer_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    let query = supabase
      .from(TABLES.ORDERS)
      .select(
        "*, customer:customers(id, email, first_name, last_name), event:events(id, name, slug, date_start)",
        { count: "exact" }
      )
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventId) query = query.eq("event_id", eventId);
    if (status) query = query.eq("status", status);
    if (paymentRef) query = query.eq("payment_ref", paymentRef);
    if (customerId) query = query.eq("customer_id", customerId);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get ticket counts per order
    const orderIds = (data || []).map((o) => o.id);
    let ticketCounts: Record<string, number> = {};

    if (orderIds.length > 0) {
      const { data: tickets } = await supabase
        .from(TABLES.TICKETS)
        .select("order_id")
        .eq("org_id", ORG_ID)
        .in("order_id", orderIds);

      if (tickets) {
        ticketCounts = tickets.reduce(
          (acc: Record<string, number>, t: { order_id: string }) => {
            acc[t.order_id] = (acc[t.order_id] || 0) + 1;
            return acc;
          },
          {}
        );
      }
    }

    const ordersWithCounts = (data || []).map((o) => ({
      ...o,
      ticket_count: ticketCounts[o.id] || 0,
    }));

    return NextResponse.json({
      data: ordersWithCounts,
      total: count || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/orders — Create a new order with simulated payment (admin/test)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { event_id, items, customer } = body;

    // Validate required fields
    if (!event_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, items[]" },
        { status: 400 }
      );
    }
    if (!customer?.email || !customer?.first_name || !customer?.last_name) {
      return NextResponse.json(
        {
          error:
            "Missing customer fields: email, first_name, last_name required",
        },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Verify event exists
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, payment_method, currency, venue_name, date_start, doors_time")
      .eq("id", event_id)
      .eq("org_id", ORG_ID)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Verify ticket availability
    const ticketTypeIds = items.map(
      (item: { ticket_type_id: string }) => item.ticket_type_id
    );
    const { data: ticketTypes, error: ttErr } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("id, name, capacity, sold")
      .eq("org_id", ORG_ID)
      .in("id", ticketTypeIds);

    if (ttErr || !ticketTypes) {
      return NextResponse.json(
        { error: "Failed to fetch ticket types" },
        { status: 500 }
      );
    }

    const ttCheck = new Map(ticketTypes.map((tt: { id: string; name: string; capacity: number | null; sold: number }) => [tt.id, tt]));

    for (const item of items as {
      ticket_type_id: string;
      qty: number;
    }[]) {
      const tt = ttCheck.get(item.ticket_type_id);
      if (!tt) {
        return NextResponse.json(
          { error: `Ticket type ${item.ticket_type_id} not found` },
          { status: 400 }
        );
      }
      if (tt.capacity !== null && tt.sold + item.qty > tt.capacity) {
        return NextResponse.json(
          {
            error: `Not enough tickets available for "${tt.name}". Available: ${tt.capacity - tt.sold}`,
          },
          { status: 400 }
        );
      }
    }

    // Create order via shared function (test mode — no Stripe, no fees)
    const result = await createOrder({
      supabase,
      orgId: ORG_ID,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        currency: event.currency,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
      },
      items: items as { ticket_type_id: string; qty: number; merch_size?: string }[],
      customer: {
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
      },
      payment: {
        method: event.payment_method || "test",
        ref: `TEST-${Date.now()}`,
      },
      sendEmail: false,
    });

    // Return full order with tickets
    const { data: fullOrder } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "*, customer:customers(*), event:events(id, name, slug, date_start, venue_name), order_items:order_items(*, ticket_type:ticket_types(name, description)), tickets:tickets(*)"
      )
      .eq("id", result.order.id)
      .single();

    return NextResponse.json({ data: fullOrder }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error("Order creation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
