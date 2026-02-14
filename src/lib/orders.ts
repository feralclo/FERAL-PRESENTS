import { revalidatePath } from "next/cache";
import { TABLES } from "@/lib/constants";
import {
  generateOrderNumber,
  generateTicketCode,
} from "@/lib/ticket-utils";
import { sendOrderConfirmationEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single line item in the order (ticket type + quantity + optional merch). */
export interface OrderLineItem {
  ticket_type_id: string;
  qty: number;
  merch_size?: string;
}

/** Customer details for the order. */
export interface OrderCustomer {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

/** Payment details attached to the order. */
export interface OrderPayment {
  method: string;
  /** Unique reference for idempotency (e.g. Stripe PaymentIntent ID, TEST-xxx). */
  ref: string;
  /** Total amount charged in major currency units (pounds, not pence).
   *  When provided (Stripe paths), fees = totalCharged - subtotal.
   *  When omitted (test/admin), total = subtotal with zero fees. */
  totalCharged?: number;
}

/** Event context needed for order creation + email. */
export interface OrderEvent {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
  venue_name?: string;
  date_start?: string;
  doors_time?: string;
}

/** VAT details attached to the order. */
export interface OrderVat {
  /** VAT amount in major currency units */
  amount: number;
  /** VAT rate (e.g. 20) */
  rate: number;
  /** Whether prices already included VAT */
  inclusive: boolean;
  /** VAT registration number */
  vat_number?: string;
}

/** Full set of parameters for createOrder(). */
export interface CreateOrderParams {
  /** Supabase server client (already initialized by the caller). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  orgId: string;
  event: OrderEvent;
  items: OrderLineItem[];
  customer: OrderCustomer;
  payment: OrderPayment;
  /** VAT details (when org is VAT-registered). */
  vat?: OrderVat;
  /** When true, fires the order confirmation email (fire-and-forget). Default true. */
  sendEmail?: boolean;
}

/** A ticket row as created by createOrder(). */
export interface CreatedTicket {
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
}

/** Ticket type row with optional product join. */
interface TicketTypeRow {
  id: string;
  name: string;
  price: number;
  sold: number;
  includes_merch?: boolean;
  merch_name?: string;
  product?: { name?: string } | null;
  [key: string]: unknown;
}

/** Result returned on success. */
export interface CreateOrderResult {
  /** The created order row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  /** All generated ticket rows. */
  tickets: CreatedTicket[];
  /** The customer ID (created or existing). */
  customerId: string;
  /** Ticket type lookup map (useful for the caller to build responses). */
  ticketTypeMap: Map<string, TicketTypeRow>;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Create an order with tickets, update sold counts and customer stats.
 *
 * This is the **single source of truth** for order creation. Three callers
 * invoke it:
 *   1. POST /api/stripe/confirm-order  — primary Stripe path
 *   2. POST /api/stripe/webhook        — backup Stripe path (idempotent)
 *   3. POST /api/orders                — admin/test path
 *
 * Consistency guarantees:
 * - Customer email is always lowercased
 * - Sold counts use the atomic `increment_sold` RPC (no race conditions)
 * - Ticket types are fetched with product join (merch names in emails)
 * - Customer stats are aggregated from actual order data (no stale guesses)
 * - Page revalidation always fires
 * - Email is sent fire-and-forget (never blocks the caller)
 */
export async function createOrder(
  params: CreateOrderParams
): Promise<CreateOrderResult> {
  const {
    supabase,
    orgId,
    event,
    items,
    customer,
    payment,
    vat,
    sendEmail = true,
  } = params;

  const email = customer.email.toLowerCase();

  // ------------------------------------------------------------------
  // 1. Fetch ticket types (with product join for merch names in emails)
  // ------------------------------------------------------------------
  const ticketTypeIds = items.map((i) => i.ticket_type_id);
  const { data: ticketTypes, error: ttErr } = await supabase
    .from(TABLES.TICKET_TYPES)
    .select("*, product:products(*)")
    .eq("org_id", orgId)
    .in("id", ticketTypeIds);

  if (ttErr || !ticketTypes) {
    throw new OrderCreationError("Failed to fetch ticket types", 500);
  }

  const ttMap = new Map<string, TicketTypeRow>(
    (ticketTypes as TicketTypeRow[]).map((tt) => [tt.id, tt])
  );

  // ------------------------------------------------------------------
  // 2. Upsert customer
  // ------------------------------------------------------------------
  const { data: existingCustomer } = await supabase
    .from(TABLES.CUSTOMERS)
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .single();

  let customerId: string;

  if (existingCustomer) {
    customerId = existingCustomer.id;
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
        org_id: orgId,
        email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone || undefined,
        first_order_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (custErr || !newCustomer) {
      throw new OrderCreationError("Failed to create customer", 500);
    }
    customerId = newCustomer.id;
  }

  // ------------------------------------------------------------------
  // 3. Calculate totals
  // ------------------------------------------------------------------
  let subtotal = 0;
  for (const item of items) {
    const tt = ttMap.get(item.ticket_type_id);
    if (tt) subtotal += Number(tt.price) * item.qty;
  }

  // When Stripe provides the actual charged amount, derive fees from the
  // difference. For test/admin orders, total = subtotal with zero fees.
  const total = payment.totalCharged ?? subtotal;
  const fees = payment.totalCharged != null
    ? Math.max(0, total - subtotal)
    : 0;

  // ------------------------------------------------------------------
  // 4. Create order (retry on order_number collision)
  // ------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let order: any = null;
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const orderNumber = await generateOrderNumber(supabase, orgId);

    // Build metadata with VAT details if applicable
    const orderMetadata: Record<string, unknown> = {};
    if (vat && vat.amount > 0) {
      orderMetadata.vat_amount = vat.amount;
      orderMetadata.vat_rate = vat.rate;
      orderMetadata.vat_inclusive = vat.inclusive;
      if (vat.vat_number) orderMetadata.vat_number = vat.vat_number;
    }

    const { data, error } = await supabase
      .from(TABLES.ORDERS)
      .insert({
        org_id: orgId,
        order_number: orderNumber,
        event_id: event.id,
        customer_id: customerId,
        status: "completed",
        subtotal,
        fees,
        total,
        currency: (event.currency || "GBP").toUpperCase(),
        payment_method: payment.method,
        payment_ref: payment.ref,
        ...(Object.keys(orderMetadata).length > 0 ? { metadata: orderMetadata } : {}),
      })
      .select()
      .single();

    if (data) {
      order = data;
      break;
    }

    const errMsg = error?.message || "";
    if (errMsg.includes("duplicate") || errMsg.includes("unique")) {
      continue;
    }
    console.error("Order creation failed:", error);
    break;
  }

  if (!order) {
    throw new OrderCreationError("Failed to create order", 500);
  }

  // ------------------------------------------------------------------
  // 5. Create order items + individual tickets
  // ------------------------------------------------------------------
  const allTickets: CreatedTicket[] = [];

  for (const item of items) {
    const tt = ttMap.get(item.ticket_type_id);
    if (!tt) continue;

    const { data: orderItem } = await supabase
      .from(TABLES.ORDER_ITEMS)
      .insert({
        org_id: orgId,
        order_id: order.id,
        ticket_type_id: item.ticket_type_id,
        qty: item.qty,
        unit_price: tt.price,
        merch_size: item.merch_size,
      })
      .select("id")
      .single();

    if (!orderItem) continue;

    for (let i = 0; i < item.qty; i++) {
      allTickets.push({
        org_id: orgId,
        order_item_id: orderItem.id,
        order_id: order.id,
        event_id: event.id,
        ticket_type_id: item.ticket_type_id,
        customer_id: customerId,
        ticket_code: generateTicketCode(),
        holder_first_name: customer.first_name,
        holder_last_name: customer.last_name,
        holder_email: email,
        merch_size: item.merch_size,
      });
    }

    // Atomically increment sold count — prevents overselling under concurrency.
    // This uses a Postgres function instead of read-then-write.
    await supabase.rpc("increment_sold", {
      p_ticket_type_id: item.ticket_type_id,
      p_qty: item.qty,
    });
  }

  if (allTickets.length > 0) {
    await supabase.from(TABLES.TICKETS).insert(allTickets);
  }

  // ------------------------------------------------------------------
  // 6. Update customer stats (aggregate from actual order data)
  // ------------------------------------------------------------------
  const { data: custOrders } = await supabase
    .from(TABLES.ORDERS)
    .select("total")
    .eq("customer_id", customerId)
    .eq("org_id", orgId)
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
        last_order_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);
  }

  // ------------------------------------------------------------------
  // 7. Send order confirmation email (fire-and-forget)
  // ------------------------------------------------------------------
  if (sendEmail) {
    sendOrderConfirmationEmail({
      orgId,
      order: {
        id: order.id,
        order_number: order.order_number,
        total,
        currency: (event.currency || "GBP").toUpperCase(),
      },
      customer: {
        first_name: customer.first_name,
        last_name: customer.last_name,
        email,
      },
      event: {
        name: event.name,
        slug: event.slug,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
        currency: event.currency,
      },
      tickets: allTickets.map((t) => {
        const tt = ttMap.get(t.ticket_type_id);
        return {
          ticket_code: t.ticket_code,
          ticket_type_name: tt?.name || "Ticket",
          merch_size: t.merch_size,
          merch_name: t.merch_size
            ? tt?.product?.name || tt?.merch_name || undefined
            : undefined,
        };
      }),
      vat: vat && vat.amount > 0 ? vat : undefined,
    }).catch(() => {
      // Silently catch — email failure must never affect the order response
    });
  }

  // ------------------------------------------------------------------
  // 7.5 Rep attribution (fire-and-forget)
  //     If a discount code was used and belongs to a rep, award points.
  // ------------------------------------------------------------------
  if (payment.ref) {
    import("@/lib/rep-attribution").then(({ attributeSaleToRep }) => {
      attributeSaleToRep({
        orderId: order.id,
        orgId,
        eventId: event.id,
        discountCode: (order.metadata as Record<string, unknown>)?.discount_code as string | undefined,
        orderTotal: total,
        ticketCount: allTickets.length,
      }).catch(() => {});
    }).catch(() => {});
  }

  // ------------------------------------------------------------------
  // 8. Revalidate pages so sold counts + order lists are fresh
  // ------------------------------------------------------------------
  if (event.slug) {
    revalidatePath(`/event/${event.slug}`);
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin/events");

  return { order, tickets: allTickets, customerId, ticketTypeMap: ttMap };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Typed error thrown by createOrder() so callers can extract the HTTP status.
 */
export class OrderCreationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "OrderCreationError";
    this.statusCode = statusCode;
  }
}
