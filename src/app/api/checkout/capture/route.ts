import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { generateNickname } from "@/lib/nicknames";

/**
 * POST /api/checkout/capture
 *
 * Public endpoint called during checkout to capture customer data
 * and create abandoned cart entries. Called at two points:
 *
 * 1. Email capture step — creates customer (email only) + abandoned cart
 * 2. Checkout form — updates customer name + updates abandoned cart
 *
 * This is fire-and-forget from the client — errors don't block checkout.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      email,
      first_name,
      last_name,
      event_id,
      items,
      subtotal,
      currency,
    } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── 1. Upsert customer ──
    // Check if customer already exists by email
    const { data: existing } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id, first_name, last_name, total_orders")
      .eq("org_id", ORG_ID)
      .eq("email", normalizedEmail)
      .single();

    let customerId: string;

    if (existing) {
      customerId = existing.id;

      // Only update name if provided AND customer doesn't already have a name
      // from a completed order (don't overwrite confirmed purchase data with
      // partial checkout data)
      if (first_name || last_name) {
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        // Update name if customer has no name yet, or if they haven't purchased
        if (!existing.first_name || existing.total_orders === 0) {
          if (first_name) updates.first_name = first_name;
          if (last_name) updates.last_name = last_name;
        }
        await supabase
          .from(TABLES.CUSTOMERS)
          .update(updates)
          .eq("id", customerId);
      }
    } else {
      // Create new customer — just email initially, name added later
      const { data: newCustomer, error: custErr } = await supabase
        .from(TABLES.CUSTOMERS)
        .insert({
          org_id: ORG_ID,
          email: normalizedEmail,
          first_name: first_name || null,
          last_name: last_name || null,
          total_orders: 0,
          total_spent: 0,
        })
        .select("id")
        .single();

      if (custErr || !newCustomer) {
        console.error("Failed to create customer:", custErr);
        return NextResponse.json(
          { error: "Failed to create customer" },
          { status: 500 }
        );
      }
      customerId = newCustomer.id;

      // Best-effort: set a fun rave nickname for the discoverer profile
      // (column may not exist yet in older database schemas)
      try {
        const nickname = generateNickname(normalizedEmail);
        await supabase
          .from(TABLES.CUSTOMERS)
          .update({ nickname })
          .eq("id", customerId);
      } catch {
        // Ignore — nickname column may not exist yet
      }
    }

    // ── 2. Upsert abandoned cart (if event/items provided) ──
    let cartCreated = false;
    let cartError: string | null = null;

    if (event_id && items && Array.isArray(items)) {
      // Check for existing abandoned cart for this customer + event
      const { data: existingCart, error: findErr } = await supabase
        .from(TABLES.ABANDONED_CARTS)
        .select("id")
        .eq("org_id", ORG_ID)
        .eq("customer_id", customerId)
        .eq("event_id", event_id)
        .eq("status", "abandoned")
        .single();

      if (findErr && findErr.code !== "PGRST116") {
        // PGRST116 = "no rows found" — that's expected for new carts
        console.error("Abandoned cart lookup failed:", findErr.message, findErr.code);
      }

      if (existingCart) {
        // Update existing abandoned cart
        const { error: updateErr } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .update({
            email: normalizedEmail,
            first_name: first_name || null,
            last_name: last_name || null,
            items,
            subtotal: subtotal || 0,
            currency: currency || "GBP",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingCart.id);

        if (updateErr) {
          console.error("Abandoned cart UPDATE failed:", updateErr.message, updateErr.code, updateErr.details);
          cartError = updateErr.message;
        } else {
          cartCreated = true;
        }
      } else {
        // Create new abandoned cart
        const { error: insertErr } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .insert({
            org_id: ORG_ID,
            customer_id: customerId,
            event_id,
            email: normalizedEmail,
            first_name: first_name || null,
            last_name: last_name || null,
            items,
            subtotal: subtotal || 0,
            currency: currency || "GBP",
            status: "abandoned",
            notification_count: 0,
          });

        if (insertErr) {
          console.error("Abandoned cart INSERT failed:", insertErr.message, insertErr.code, insertErr.details);
          cartError = insertErr.message;
        } else {
          cartCreated = true;
        }
      }
    }

    return NextResponse.json({
      customer_id: customerId,
      cart_created: cartCreated,
      ...(cartError ? { cart_error: cartError } : {}),
    });
  } catch (err) {
    console.error("Checkout capture error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
