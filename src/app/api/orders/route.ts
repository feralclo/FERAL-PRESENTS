import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  generateOrderNumber,
  generateTicketCode,
} from "@/lib/ticket-utils";

/**
 * GET /api/orders — List orders with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");
    const status = searchParams.get("status");
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
 * POST /api/orders — Create a new order with simulated payment
 */
export async function POST(request: NextRequest) {
  try {
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

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Verify event exists
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, payment_method, currency")
      .eq("id", event_id)
      .eq("org_id", ORG_ID)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Verify ticket availability and get prices
    const ticketTypeIds = items.map(
      (item: { ticket_type_id: string }) => item.ticket_type_id
    );
    const { data: ticketTypes, error: ttErr } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("*")
      .eq("org_id", ORG_ID)
      .in("id", ticketTypeIds);

    if (ttErr || !ticketTypes) {
      return NextResponse.json(
        { error: "Failed to fetch ticket types" },
        { status: 500 }
      );
    }

    const ttMap = new Map(ticketTypes.map((tt) => [tt.id, tt]));

    // Check availability
    for (const item of items as {
      ticket_type_id: string;
      qty: number;
    }[]) {
      const tt = ttMap.get(item.ticket_type_id);
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

    // Upsert customer
    const { data: existingCustomer } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id")
      .eq("org_id", ORG_ID)
      .eq("email", customer.email.toLowerCase())
      .single();

    let customerId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
      // Update name/phone if provided
      await supabase
        .from(TABLES.CUSTOMERS)
        .update({
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from(TABLES.CUSTOMERS)
        .insert({
          org_id: ORG_ID,
          email: customer.email.toLowerCase(),
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          first_order_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (custErr || !newCustomer) {
        return NextResponse.json(
          { error: "Failed to create customer" },
          { status: 500 }
        );
      }
      customerId = newCustomer.id;
    }

    // Calculate totals
    let subtotal = 0;
    for (const item of items as {
      ticket_type_id: string;
      qty: number;
    }[]) {
      const tt = ttMap.get(item.ticket_type_id)!;
      subtotal += Number(tt.price) * item.qty;
    }
    const fees = 0; // No fees in test mode
    const total = subtotal + fees;

    // Simulate payment — always succeeds in test mode
    const paymentRef = `TEST-${Date.now()}`;

    // Generate order number and create order with retry on collision
    let order = null;
    let orderErr = null;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const orderNumber = await generateOrderNumber(supabase, ORG_ID);

      const result = await supabase
        .from(TABLES.ORDERS)
        .insert({
          org_id: ORG_ID,
          order_number: orderNumber,
          event_id,
          customer_id: customerId,
          status: "completed",
          subtotal,
          fees,
          total,
          currency: event.currency || "GBP",
          payment_method: event.payment_method || "test",
          payment_ref: paymentRef,
        })
        .select()
        .single();

      if (result.data) {
        order = result.data;
        orderErr = null;
        break;
      }

      // If it's a unique constraint violation on order_number, retry
      const errMsg = result.error?.message || "";
      if (errMsg.includes("duplicate") || errMsg.includes("unique")) {
        orderErr = result.error;
        continue;
      }

      // For other errors, break immediately
      orderErr = result.error;
      break;
    }

    if (orderErr || !order) {
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Create order items and individual tickets
    const allTickets: {
      org_id: string;
      order_item_id: string;
      order_id: string;
      event_id: string;
      ticket_type_id: string;
      customer_id: string;
      ticket_code: string;
      holder_first_name: string;
      holder_last_name: string;
      holder_email: string;
      merch_size?: string;
    }[] = [];

    for (const item of items as {
      ticket_type_id: string;
      qty: number;
      merch_size?: string;
    }[]) {
      const tt = ttMap.get(item.ticket_type_id)!;

      // Create order item
      const { data: orderItem, error: oiErr } = await supabase
        .from(TABLES.ORDER_ITEMS)
        .insert({
          org_id: ORG_ID,
          order_id: order.id,
          ticket_type_id: item.ticket_type_id,
          qty: item.qty,
          unit_price: tt.price,
          merch_size: item.merch_size,
        })
        .select("id")
        .single();

      if (oiErr || !orderItem) {
        continue;
      }

      // Create individual tickets (one per qty)
      for (let i = 0; i < item.qty; i++) {
        allTickets.push({
          org_id: ORG_ID,
          order_item_id: orderItem.id,
          order_id: order.id,
          event_id,
          ticket_type_id: item.ticket_type_id,
          customer_id: customerId,
          ticket_code: generateTicketCode(),
          holder_first_name: customer.first_name,
          holder_last_name: customer.last_name,
          holder_email: customer.email.toLowerCase(),
          merch_size: item.merch_size,
        });
      }

      // Update sold count
      await supabase
        .from(TABLES.TICKET_TYPES)
        .update({
          sold: tt.sold + item.qty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.ticket_type_id);
    }

    // Insert all tickets
    if (allTickets.length > 0) {
      await supabase.from(TABLES.TICKETS).insert(allTickets);
    }

    // Update customer stats
    await supabase
      .from(TABLES.CUSTOMERS)
      .update({
        total_orders: (existingCustomer ? 1 : 0) + 1, // Will be corrected by reading actual count
        total_spent: total,
        last_order_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);

    // Fetch fresh customer stats (correct aggregation)
    const { data: custOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("total")
      .eq("customer_id", customerId)
      .eq("org_id", ORG_ID)
      .eq("status", "completed");

    if (custOrders) {
      const totalSpent = custOrders.reduce(
        (sum: number, o: { total: number }) => sum + Number(o.total),
        0
      );
      await supabase
        .from(TABLES.CUSTOMERS)
        .update({
          total_orders: custOrders.length,
          total_spent: totalSpent,
        })
        .eq("id", customerId);
    }

    // Return full order with tickets
    const { data: fullOrder } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "*, customer:customers(*), event:events(id, name, slug, date_start, venue_name), order_items:order_items(*, ticket_type:ticket_types(name, description)), tickets:tickets(*)"
      )
      .eq("id", order.id)
      .single();

    // Revalidate the event page so sold counts update
    if (event.slug) {
      revalidatePath(`/event/${event.slug}`);
    }
    revalidatePath("/admin/orders");
    revalidatePath("/admin/events");

    return NextResponse.json({ data: fullOrder }, { status: 201 });
  } catch (err) {
    console.error("Order creation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
