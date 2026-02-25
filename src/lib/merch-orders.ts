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

/** A single merch item in the order. */
export interface MerchOrderLineItem {
  collection_item_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  merch_size?: string;
}

/** Customer details for the merch order. */
export interface MerchOrderCustomer {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  marketing_consent?: boolean;
}

/** Payment details for the merch order. */
export interface MerchOrderPayment {
  method: string;
  ref: string;
  totalCharged?: number;
}

/** Event context for the merch order. */
export interface MerchOrderEvent {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
  venue_name?: string;
  date_start?: string;
  doors_time?: string;
}

/** VAT details for the merch order. */
export interface MerchOrderVat {
  amount: number;
  rate: number;
  inclusive: boolean;
  vat_number?: string;
}

/** Full params for createMerchOrder(). */
export interface CreateMerchOrderParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  orgId: string;
  event: MerchOrderEvent;
  collectionId: string;
  collectionTitle: string;
  items: MerchOrderLineItem[];
  customer: MerchOrderCustomer;
  payment: MerchOrderPayment;
  /** The hidden ticket type for merch passes on this event. */
  merchPassTicketTypeId: string;
  vat?: MerchOrderVat;
  sendEmail?: boolean;
}

/** Result returned on success. */
export interface CreateMerchOrderResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  tickets: MerchTicket[];
  customerId: string;
}

/** A merch pass ticket row. */
export interface MerchTicket {
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

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Create a merch pre-order with tickets (QR codes for collection).
 *
 * Similar to createOrder() in lib/orders.ts but designed for merch:
 * - Subtotal calculated from item prices (not ticket_type.price)
 * - Creates order_items with merch details
 * - Generates "merch pass" tickets for QR code scanning at the event
 * - Sends merch-specific order confirmation email
 */
export async function createMerchOrder(
  params: CreateMerchOrderParams
): Promise<CreateMerchOrderResult> {
  const {
    supabase,
    orgId,
    event,
    collectionId,
    collectionTitle,
    items,
    customer,
    payment,
    merchPassTicketTypeId,
    vat,
    sendEmail = true,
  } = params;

  const email = customer.email.toLowerCase();

  // ------------------------------------------------------------------
  // 1. Upsert customer
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
    const custUpdate: Record<string, unknown> = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone || undefined,
      updated_at: new Date().toISOString(),
    };
    if (typeof customer.marketing_consent === "boolean") {
      custUpdate.marketing_consent = customer.marketing_consent;
      custUpdate.marketing_consent_at = new Date().toISOString();
      custUpdate.marketing_consent_source = "merch_checkout";
    }
    await supabase
      .from(TABLES.CUSTOMERS)
      .update(custUpdate)
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
        ...(typeof customer.marketing_consent === "boolean" ? {
          marketing_consent: customer.marketing_consent,
          marketing_consent_at: new Date().toISOString(),
          marketing_consent_source: "merch_checkout",
        } : {}),
      })
      .select("id")
      .single();

    if (custErr || !newCustomer) {
      throw new MerchOrderError("Failed to create customer", 500);
    }
    customerId = newCustomer.id;
  }

  // ------------------------------------------------------------------
  // 2. Calculate totals from item prices
  // ------------------------------------------------------------------
  let subtotal = 0;
  for (const item of items) {
    subtotal += Number(item.unit_price) * item.qty;
  }

  const total = payment.totalCharged ?? subtotal;
  const fees = payment.totalCharged != null
    ? Math.max(0, total - subtotal)
    : 0;

  // ------------------------------------------------------------------
  // 3. Create order
  // ------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let order: any = null;
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const orderNumber = await generateOrderNumber(supabase, orgId);

    const orderMetadata: Record<string, unknown> = {
      order_type: "merch_preorder",
      collection_id: collectionId,
      collection_title: collectionTitle,
      merch_items: items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        qty: i.qty,
        unit_price: i.unit_price,
        merch_size: i.merch_size,
      })),
    };
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
        metadata: orderMetadata,
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
    console.error("Merch order creation failed:", error);
    break;
  }

  if (!order) {
    throw new MerchOrderError("Failed to create merch order", 500);
  }

  // ------------------------------------------------------------------
  // 4. Create order items + merch pass tickets
  // ------------------------------------------------------------------
  const allTickets: MerchTicket[] = [];

  for (const item of items) {
    const { data: orderItem } = await supabase
      .from(TABLES.ORDER_ITEMS)
      .insert({
        org_id: orgId,
        order_id: order.id,
        ticket_type_id: merchPassTicketTypeId,
        qty: item.qty,
        unit_price: item.unit_price,
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
        ticket_type_id: merchPassTicketTypeId,
        customer_id: customerId,
        ticket_code: generateTicketCode(orgId),
        holder_first_name: customer.first_name,
        holder_last_name: customer.last_name,
        holder_email: email,
        merch_size: item.merch_size,
      });
    }

    // Increment sold count on the merch pass ticket type
    await supabase.rpc("increment_sold", {
      p_ticket_type_id: merchPassTicketTypeId,
      p_qty: item.qty,
    });
  }

  if (allTickets.length > 0) {
    await supabase.from(TABLES.TICKETS).insert(allTickets);
  }

  // ------------------------------------------------------------------
  // 5. Update customer stats
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
  // 6. Send merch order confirmation email
  // ------------------------------------------------------------------
  if (sendEmail) {
    try {
      await sendOrderConfirmationEmail({
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
        tickets: allTickets.map((t) => ({
          ticket_code: t.ticket_code,
          ticket_type_name: "Merch Pre-order",
          merch_size: t.merch_size,
          merch_name: items.find(
            (item) => item.merch_size === t.merch_size || !t.merch_size
          )?.product_name,
        })),
        vat: vat && vat.amount > 0 ? vat : undefined,
      });
    } catch {
      // Email failure must never affect the order response
    }
  }

  // ------------------------------------------------------------------
  // 7. Revalidate pages
  // ------------------------------------------------------------------
  if (event.slug) {
    revalidatePath(`/shop`);
  }
  revalidatePath("/admin/orders");

  return { order, tickets: allTickets, customerId };
}

// ---------------------------------------------------------------------------
// Helper: ensure a hidden "Merch Pre-order" ticket type exists on the event
// ---------------------------------------------------------------------------

/**
 * Ensure a hidden "Merch Pre-order" ticket type exists for the given event.
 * This virtual ticket type is used to create order_items and tickets for
 * merch-only orders, so the existing scanning infrastructure works.
 *
 * Returns the ticket type ID.
 */
export async function ensureMerchPassTicketType(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  eventId: string
): Promise<string> {
  // Check if one already exists
  const { data: existing } = await supabase
    .from(TABLES.TICKET_TYPES)
    .select("id")
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("name", "Merch Pre-order")
    .eq("status", "hidden")
    .single();

  if (existing) return existing.id;

  // Create the hidden ticket type
  const { data: created, error } = await supabase
    .from(TABLES.TICKET_TYPES)
    .insert({
      org_id: orgId,
      event_id: eventId,
      name: "Merch Pre-order",
      price: 0,
      capacity: null, // Unlimited
      sold: 0,
      status: "hidden",
      sort_order: 9999, // Push to the bottom
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new MerchOrderError("Failed to create merch pass ticket type", 500);
  }

  return created.id;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MerchOrderError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "MerchOrderError";
    this.statusCode = statusCode;
  }
}
