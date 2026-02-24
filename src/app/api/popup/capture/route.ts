import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
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
    const orgId = getOrgIdFromRequest(request);
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

    // Read Vercel geo headers (only available on Vercel deployment)
    const geoCity = request.headers.get("x-vercel-ip-city");
    const geoCountry = request.headers.get("x-vercel-ip-country");

    // Check if customer already exists
    const { data: existing } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id, city, marketing_consent")
      .eq("org_id", orgId)
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      // Existing customer — update timestamp + backfill geo if missing
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (!existing.city && geoCity) updates.city = decodeURIComponent(geoCity);
      if (!existing.city && geoCountry) updates.country = geoCountry;

      // Upgrade marketing consent only if currently unknown (null) — never overwrite explicit false (unsubscribe)
      if (existing.marketing_consent === null || existing.marketing_consent === undefined) {
        updates.marketing_consent = true;
        updates.marketing_consent_at = new Date().toISOString();
        updates.marketing_consent_source = "popup";
      }

      await supabase
        .from(TABLES.CUSTOMERS)
        .update(updates)
        .eq("id", existing.id);

      return NextResponse.json({ customer_id: existing.id, created: false });
    }

    // New customer — create with popup source attribution + geo
    const nickname = generateNickname(normalizedEmail);
    const { data: newCustomer, error: custErr } = await supabase
      .from(TABLES.CUSTOMERS)
      .insert({
        org_id: orgId,
        email: normalizedEmail,
        nickname,
        source: "popup",
        total_orders: 0,
        total_spent: 0,
        city: geoCity ? decodeURIComponent(geoCity) : null,
        country: geoCountry || null,
        marketing_consent: true,
        marketing_consent_at: new Date().toISOString(),
        marketing_consent_source: "popup",
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
