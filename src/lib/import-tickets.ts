import { TABLES } from "@/lib/constants";
import { generateOrderNumber } from "@/lib/ticket-utils";
import crypto from "crypto";
import type {
  ImportTicketRow,
  ImportResult,
  ImportError,
  TicketTypeMapping,
} from "@/types/import-tickets";

interface ImportParams {
  eventId: string;
  orgId: string;
  sourcePlatform: string;
  ticketTypeMappings: TicketTypeMapping[];
  tickets: ImportTicketRow[];
}

/**
 * Import external tickets into the Entry platform.
 *
 * Creates hidden ticket types, upserts customers, and inserts tickets with
 * external barcodes as the ticket_code. Does NOT increment sold counts on
 * existing ticket types, and does NOT send confirmation emails.
 *
 * Tickets are grouped under a single batch order with payment_method "imported"
 * for clean tracking and order-number display in scan results.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importExternalTickets(
  supabase: any,
  params: ImportParams
): Promise<ImportResult> {
  const { eventId, orgId, sourcePlatform, ticketTypeMappings, tickets } =
    params;
  const batchId = crypto.randomUUID();
  const errors: ImportError[] = [];

  // ── 1. Validate: dedupe barcodes within the import ──────────────────
  const barcodeSet = new Set<string>();
  const validTickets: (ImportTicketRow & { rowIndex: number })[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const barcode = t.barcode?.trim();
    if (!barcode) {
      errors.push({ row: i + 1, barcode: "", reason: "Missing barcode" });
      continue;
    }
    if (barcodeSet.has(barcode)) {
      errors.push({
        row: i + 1,
        barcode,
        reason: "Duplicate barcode in CSV",
      });
      continue;
    }
    barcodeSet.add(barcode);
    validTickets.push({ ...t, barcode, rowIndex: i + 1 });
  }

  // ── 2. Check for barcodes that already exist in the DB ──────────────
  // Query in chunks of 200 to stay within PostgREST URL limits
  const CHUNK = 200;
  const existingCodes = new Set<string>();

  for (let i = 0; i < validTickets.length; i += CHUNK) {
    const chunk = validTickets.slice(i, i + CHUNK).map((t) => t.barcode);
    const { data: existing } = await supabase
      .from(TABLES.TICKETS)
      .select("ticket_code")
      .in("ticket_code", chunk);
    for (const row of existing || []) {
      existingCodes.add(row.ticket_code);
    }
  }

  const newTickets = validTickets.filter((t) => {
    if (existingCodes.has(t.barcode)) {
      errors.push({
        row: t.rowIndex,
        barcode: t.barcode,
        reason: "Barcode already exists in database",
      });
      return false;
    }
    return true;
  });

  if (newTickets.length === 0) {
    return {
      imported: 0,
      skipped: tickets.length,
      errors,
      batch_id: batchId,
    };
  }

  // ── 3. Fetch event ──────────────────────────────────────────────────
  const { data: event } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name, slug, currency, venue_name, date_start")
    .eq("id", eventId)
    .eq("org_id", orgId)
    .single();

  if (!event) throw new Error("Event not found");

  // ── 4. Create or reuse hidden ticket types for each mapping ─────────
  const ticketTypeIds = new Map<string, string>();

  for (const mapping of ticketTypeMappings) {
    // Check if a matching hidden ticket type already exists (from a prior import)
    const { data: existingTT } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("id")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("name", mapping.displayName)
      .single();

    if (existingTT) {
      ticketTypeIds.set(mapping.externalName, existingTT.id);
    } else {
      const { data: newTT } = await supabase
        .from(TABLES.TICKET_TYPES)
        .insert({
          org_id: orgId,
          event_id: eventId,
          name: mapping.displayName,
          price: 0,
          capacity: null,
          sold: 0,
          status: "hidden",
          sort_order: 9990,
        })
        .select("id")
        .single();

      if (newTT) ticketTypeIds.set(mapping.externalName, newTT.id);
    }
  }

  // ── 5. Upsert customers (one per unique email) ─────────────────────
  const customerMap = new Map<string, string>();
  const uniqueEmails = [
    ...new Set(
      newTickets.map((t) => t.email?.toLowerCase()).filter(Boolean)
    ),
  ];

  for (const email of uniqueEmails) {
    const ticket = newTickets.find(
      (t) => t.email?.toLowerCase() === email
    )!;
    const { data: existing } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id")
      .eq("org_id", orgId)
      .eq("email", email)
      .single();

    if (existing) {
      customerMap.set(email, existing.id);
    } else {
      const { data: newCust } = await supabase
        .from(TABLES.CUSTOMERS)
        .insert({
          org_id: orgId,
          email,
          first_name: ticket.first_name,
          last_name: ticket.last_name,
        })
        .select("id")
        .single();

      if (newCust) customerMap.set(email, newCust.id);
    }
  }

  // ── 6. Create batch order ──────────────────────────────────────────
  const orderNumber = await generateOrderNumber(supabase, orgId);
  const firstCustomerId =
    customerMap.values().next().value || null;

  const { data: order } = await supabase
    .from(TABLES.ORDERS)
    .insert({
      org_id: orgId,
      order_number: orderNumber,
      event_id: eventId,
      customer_id: firstCustomerId,
      status: "completed",
      subtotal: 0,
      fees: 0,
      total: 0,
      currency: event.currency || "GBP",
      payment_method: "imported",
      payment_ref: `IMPORT-${batchId}`,
      notes: `Imported ${newTickets.length} tickets from ${sourcePlatform}`,
      metadata: {
        import_source: sourcePlatform,
        import_batch_id: batchId,
        import_ticket_count: newTickets.length,
        import_skipped_count: errors.length,
        imported_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (!order) throw new Error("Failed to create import batch order");

  // ── 7. Create order items (one per ticket type) ────────────────────
  const orderItemMap = new Map<string, string>();
  const fallbackTTId = ticketTypeIds.values().next().value;

  for (const mapping of ticketTypeMappings) {
    const ttId = ticketTypeIds.get(mapping.externalName);
    if (!ttId) continue;

    const qty = newTickets.filter(
      (t) => t.ticket_type === mapping.externalName
    ).length;
    if (qty === 0) continue;

    const { data: orderItem } = await supabase
      .from(TABLES.ORDER_ITEMS)
      .insert({
        org_id: orgId,
        order_id: order.id,
        ticket_type_id: ttId,
        qty,
        unit_price: 0,
      })
      .select("id")
      .single();

    if (orderItem) orderItemMap.set(mapping.externalName, orderItem.id);
  }

  const fallbackOrderItemId = orderItemMap.values().next().value;

  // ── 8. Create individual tickets with external barcodes ────────────
  let importedCount = 0;

  const ticketRows = newTickets.map((t) => ({
    org_id: orgId,
    order_item_id: orderItemMap.get(t.ticket_type) || fallbackOrderItemId,
    order_id: order.id,
    event_id: eventId,
    ticket_type_id:
      ticketTypeIds.get(t.ticket_type) || fallbackTTId,
    customer_id:
      customerMap.get(t.email?.toLowerCase()) || firstCustomerId,
    ticket_code: t.barcode,
    holder_first_name: t.first_name || "",
    holder_last_name: t.last_name || "",
    holder_email: (t.email || "").toLowerCase(),
    status: "valid",
  }));

  // Insert in batches of 50 to avoid payload limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < ticketRows.length; i += BATCH_SIZE) {
    const batch = ticketRows.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await supabase
      .from(TABLES.TICKETS)
      .insert(batch);

    if (insertErr) {
      // Fall back to individual inserts to identify specific failures
      for (const ticket of batch) {
        const { error: singleErr } = await supabase
          .from(TABLES.TICKETS)
          .insert(ticket);
        if (singleErr) {
          const row = newTickets.find(
            (t) => t.barcode === ticket.ticket_code
          );
          errors.push({
            row: row?.rowIndex || 0,
            barcode: ticket.ticket_code,
            reason: singleErr.message || "Failed to create ticket",
          });
        } else {
          importedCount++;
        }
      }
    } else {
      importedCount += batch.length;
    }
  }

  // ── 9. Update order metadata with final counts ─────────────────────
  await supabase
    .from(TABLES.ORDERS)
    .update({
      metadata: {
        import_source: sourcePlatform,
        import_batch_id: batchId,
        import_ticket_count: importedCount,
        import_skipped_count: tickets.length - importedCount,
        imported_at: new Date().toISOString(),
      },
    })
    .eq("id", order.id);

  return {
    imported: importedCount,
    skipped: tickets.length - importedCount,
    errors,
    order_number: orderNumber,
    batch_id: batchId,
  };
}
