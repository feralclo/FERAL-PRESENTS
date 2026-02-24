import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { generateNickname } from "@/lib/nicknames";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import { createRateLimiter } from "@/lib/rate-limit";

const signupLimiter = createRateLimiter("announcement-signup", {
  limit: 10,
  windowSeconds: 60,
});

/**
 * POST /api/announcement/signup
 *
 * Public endpoint for event interest signups (coming soon / announcement mode).
 * Upserts customer and creates an event_interest_signups record.
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = signupLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const body = await request.json();
    const { email, event_id, first_name } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!event_id || typeof event_id !== "string") {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400 }
      );
    }

    if (isRestrictedCheckoutEmail(email)) {
      return NextResponse.json({ success: true, already_signed_up: false });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify event exists, belongs to org, and has tickets_live_at in the future
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, tickets_live_at")
      .eq("id", event_id)
      .eq("org_id", orgId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (!event.tickets_live_at || new Date(event.tickets_live_at) <= new Date()) {
      return NextResponse.json(
        { error: "This event is not in announcement mode" },
        { status: 400 }
      );
    }

    // Upsert customer (mirror pattern from checkout/capture)
    const geoCity = request.headers.get("x-vercel-ip-city");
    const geoCountry = request.headers.get("x-vercel-ip-country");

    const { data: existing } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id, first_name")
      .eq("org_id", orgId)
      .eq("email", normalizedEmail)
      .single();

    let customerId: string;

    if (existing) {
      customerId = existing.id;
      // Update first_name if customer doesn't have one yet
      if (first_name && !existing.first_name) {
        await supabase
          .from(TABLES.CUSTOMERS)
          .update({ first_name, updated_at: new Date().toISOString() })
          .eq("id", customerId);
      }
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from(TABLES.CUSTOMERS)
        .insert({
          org_id: orgId,
          email: normalizedEmail,
          first_name: first_name || null,
          last_name: null,
          source: "announcement",
          total_orders: 0,
          total_spent: 0,
          city: geoCity ? decodeURIComponent(geoCity) : null,
          country: geoCountry || null,
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

      // Best-effort nickname
      try {
        const nickname = generateNickname(normalizedEmail);
        await supabase
          .from(TABLES.CUSTOMERS)
          .update({ nickname })
          .eq("id", customerId);
      } catch {
        // Ignore — nickname column may not exist
      }
    }

    // Insert into event_interest_signups (ON CONFLICT DO NOTHING)
    const { error: signupErr } = await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .upsert(
        {
          org_id: orgId,
          event_id,
          customer_id: customerId,
          email: normalizedEmail,
          first_name: first_name || null,
          signed_up_at: new Date().toISOString(),
        },
        { onConflict: "org_id,event_id,customer_id", ignoreDuplicates: true }
      );

    const alreadySignedUp = !signupErr
      ? false
      : signupErr.code === "23505"; // unique violation = already signed up

    if (signupErr && signupErr.code !== "23505") {
      console.error("Interest signup insert failed:", signupErr);
    }

    return NextResponse.json({ success: true, already_signed_up: alreadySignedUp });
  } catch (err) {
    console.error("Announcement signup error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
