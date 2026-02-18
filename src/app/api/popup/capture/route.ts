import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { generateNickname } from "@/lib/nicknames";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";

/**
 * POST /api/popup/capture
 *
 * Public endpoint called when a user submits their email in the discount popup.
 * Creates or updates a customer record with source attribution.
 * Fire-and-forget from the client — errors don't block the popup flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (isRestrictedCheckoutEmail(email)) {
      return NextResponse.json({ customer_id: "ok", created: false });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if customer already exists
    const { data: existing } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id")
      .eq("org_id", ORG_ID)
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      // Existing customer — update timestamp only (don't overwrite source)
      await supabase
        .from(TABLES.CUSTOMERS)
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      return NextResponse.json({ customer_id: existing.id, created: false });
    }

    // New customer — create with popup source attribution
    const nickname = generateNickname(normalizedEmail);
    const { data: newCustomer, error: custErr } = await supabase
      .from(TABLES.CUSTOMERS)
      .insert({
        org_id: ORG_ID,
        email: normalizedEmail,
        nickname,
        source: "popup",
        total_orders: 0,
        total_spent: 0,
      })
      .select("id")
      .single();

    if (custErr || !newCustomer) {
      console.error("Popup capture: failed to create customer:", custErr);
      return NextResponse.json(
        { error: "Failed to create customer" },
        { status: 500 }
      );
    }

    return NextResponse.json({ customer_id: newCustomer.id, created: true });
  } catch (err) {
    console.error("Popup capture error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
