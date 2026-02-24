import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, announcementAutomationKey } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { generateNickname } from "@/lib/nicknames";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import { createRateLimiter } from "@/lib/rate-limit";
import { sendAnnouncementEmail } from "@/lib/email";
import type { AnnouncementAutomationSettings } from "@/types/announcements";

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
      .select("id, name, slug, venue_name, date_start, tickets_live_at")
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
      .select("id, first_name, marketing_consent")
      .eq("org_id", orgId)
      .eq("email", normalizedEmail)
      .single();

    let customerId: string;

    if (existing) {
      customerId = existing.id;
      // Update first_name if customer doesn't have one yet + upgrade marketing consent if unknown
      const custUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (first_name && !existing.first_name) custUpdates.first_name = first_name;
      if (existing.marketing_consent === null || existing.marketing_consent === undefined) {
        custUpdates.marketing_consent = true;
        custUpdates.marketing_consent_at = new Date().toISOString();
        custUpdates.marketing_consent_source = "announcement";
      }
      if (Object.keys(custUpdates).length > 1) {
        await supabase
          .from(TABLES.CUSTOMERS)
          .update(custUpdates)
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
          marketing_consent: true,
          marketing_consent_at: new Date().toISOString(),
          marketing_consent_source: "announcement",
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

    // Check for existing signup (may be unsubscribed — re-engagement should resubscribe)
    const { data: existingSignup } = await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .select("id, notification_count, unsubscribe_token, unsubscribed_at, first_name")
      .eq("org_id", orgId)
      .eq("event_id", event_id)
      .eq("customer_id", customerId)
      .single();

    let signupRow: { id: string; notification_count: number; unsubscribe_token: string } | null = null;
    let alreadySignedUp = false;

    if (existingSignup) {
      if (existingSignup.unsubscribed_at) {
        // Re-engagement after unsubscribe — clear flag, reset to step 0 so they
        // re-enter the email sequence from the beginning
        const { data: updated, error: updateErr } = await supabase
          .from(TABLES.EVENT_INTEREST_SIGNUPS)
          .update({
            unsubscribed_at: null,
            notification_count: 0,
            first_name: first_name || existingSignup.first_name || null,
            signed_up_at: new Date().toISOString(),
          })
          .eq("id", existingSignup.id)
          .select("id, notification_count, unsubscribe_token")
          .single();

        if (updateErr) {
          console.error("Interest signup resubscribe failed:", updateErr);
        }
        signupRow = updated;

        // Re-consent the customer (they actively re-engaged)
        await supabase
          .from(TABLES.CUSTOMERS)
          .update({
            marketing_consent: true,
            marketing_consent_at: new Date().toISOString(),
            marketing_consent_source: "announcement",
          })
          .eq("id", customerId);
      } else {
        // Already signed up and not unsubscribed — no-op
        alreadySignedUp = true;
      }
    } else {
      // New signup
      const { data: newSignup, error: signupErr } = await supabase
        .from(TABLES.EVENT_INTEREST_SIGNUPS)
        .insert({
          org_id: orgId,
          event_id,
          customer_id: customerId,
          email: normalizedEmail,
          first_name: first_name || null,
          signed_up_at: new Date().toISOString(),
        })
        .select("id, notification_count, unsubscribe_token")
        .single();

      if (signupErr) {
        console.error("Interest signup insert failed:", signupErr);
      }
      signupRow = newSignup;
    }

    // Send step 1 confirmation email (fire-and-forget, non-blocking)
    if (signupRow && signupRow.notification_count === 0) {
      // Load automation settings
      let automationEnabled = true;
      let step1Enabled = true;
      let step1Subject: string | undefined;
      let step1Heading: string | undefined;
      let step1Body: string | undefined;
      try {
        const { data: settingsRow } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", announcementAutomationKey(orgId))
          .single();
        if (settingsRow?.data) {
          const s = settingsRow.data as Partial<AnnouncementAutomationSettings>;
          if (s.enabled === false) automationEnabled = false;
          if (s.step_1_enabled === false) step1Enabled = false;
          step1Subject = s.step_1_subject;
          step1Heading = s.step_1_heading;
          step1Body = s.step_1_body;
        }
      } catch { /* settings not found — use defaults */ }

      // Bump notification_count from 0 to 1 atomically
      await supabase
        .from(TABLES.EVENT_INTEREST_SIGNUPS)
        .update({ notification_count: 1 })
        .eq("id", signupRow.id)
        .eq("notification_count", 0);

      // Send email if enabled (fire-and-forget)
      if (automationEnabled && step1Enabled) {
        sendAnnouncementEmail({
          orgId,
          email: normalizedEmail,
          step: 1,
          firstName: first_name || undefined,
          event: {
            name: event.name,
            slug: event.slug,
            venue_name: event.venue_name,
            date_start: event.date_start,
            tickets_live_at: event.tickets_live_at,
          },
          unsubscribeToken: signupRow.unsubscribe_token,
          customSubject: step1Subject,
          customHeading: step1Heading,
          customBody: step1Body,
        }).catch((err) => console.error("[announcement] Step 1 email failed:", err));
      }
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
