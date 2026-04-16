import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import { createRateLimiter } from "@/lib/rate-limit";
import { sendWaitlistConfirmationEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";

const joinLimiter = createRateLimiter("waitlist-join", {
  limit: 10,
  windowSeconds: 60,
});

/**
 * POST /api/waitlist/join
 *
 * Public endpoint — join the waitlist for a sold-out event.
 * Upserts customer, inserts waitlist_signup, sends confirmation email.
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = joinLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const body = await request.json();
    const { email, event_id, first_name, marketing_consent } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!event_id || typeof event_id !== "string") {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    if (isRestrictedCheckoutEmail(email)) {
      return NextResponse.json({ success: true, already_joined: false });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify event exists + belongs to org
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, venue_name, date_start")
      .eq("id", event_id)
      .eq("org_id", orgId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check for existing signup
    const { data: existing } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .select("id, status")
      .eq("org_id", orgId)
      .eq("event_id", event_id)
      .eq("email", normalizedEmail)
      .single();

    if (existing && existing.status !== "expired" && existing.status !== "removed") {
      return NextResponse.json({ success: true, already_joined: true });
    }

    // Upsert customer
    const geoCity = request.headers.get("x-vercel-ip-city");
    const geoCountry = request.headers.get("x-vercel-ip-country");
    const consentGiven = marketing_consent === true;

    let customerId: string | null = null;
    const { data: existingCustomer } = await supabase
      .from(TABLES.CUSTOMERS)
      .select("id, first_name, marketing_consent")
      .eq("org_id", orgId)
      .eq("email", normalizedEmail)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (first_name && !existingCustomer.first_name) updates.first_name = first_name;
      if (consentGiven && !existingCustomer.marketing_consent) {
        updates.marketing_consent = true;
        updates.marketing_consent_at = new Date().toISOString();
        updates.marketing_consent_source = "waitlist";
      }
      if (Object.keys(updates).length > 1) {
        await supabase.from(TABLES.CUSTOMERS).update(updates).eq("id", customerId);
      }
    } else {
      const { data: newCustomer } = await supabase
        .from(TABLES.CUSTOMERS)
        .insert({
          org_id: orgId,
          email: normalizedEmail,
          first_name: first_name || null,
          last_name: null,
          source: "waitlist",
          total_orders: 0,
          total_spent: 0,
          city: geoCity ? decodeURIComponent(geoCity) : null,
          country: geoCountry || null,
          marketing_consent: consentGiven,
          ...(consentGiven ? {
            marketing_consent_at: new Date().toISOString(),
            marketing_consent_source: "waitlist",
          } : {}),
        })
        .select("id")
        .single();
      if (newCustomer) customerId = newCustomer.id;
    }

    // Insert or re-activate waitlist signup
    let signupId: string;
    if (existing) {
      // Re-activating an expired/removed entry
      const { data: updated } = await supabase
        .from(TABLES.WAITLIST_SIGNUPS)
        .update({
          status: "pending",
          first_name: first_name || null,
          marketing_consent: consentGiven,
          customer_id: customerId,
          notification_token: null,
          notified_at: null,
          token_expires_at: null,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      signupId = updated?.id || existing.id;
    } else {
      const { data: newSignup, error: insertErr } = await supabase
        .from(TABLES.WAITLIST_SIGNUPS)
        .insert({
          org_id: orgId,
          event_id,
          customer_id: customerId,
          email: normalizedEmail,
          first_name: first_name || null,
          marketing_consent: consentGiven,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertErr || !newSignup) {
        Sentry.captureException(insertErr || new Error("Waitlist insert returned null"));
        return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
      }
      signupId = newSignup.id;
    }

    // Calculate position (count pending entries before this one by created_at)
    const { count } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("event_id", event_id)
      .eq("status", "pending");

    const position = (count ?? 1);

    // Send confirmation email (fire-and-forget)
    sendWaitlistConfirmationEmail({
      orgId,
      email: normalizedEmail,
      firstName: first_name || undefined,
      event: {
        name: event.name,
        slug: event.slug,
        venue_name: event.venue_name,
        date_start: event.date_start,
      },
      position,
    }).catch((err) => console.error("[waitlist] Confirmation email failed:", err));

    return NextResponse.json({ success: true, already_joined: false, position, signup_id: signupId });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Waitlist join error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
