import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getGuestListSettings, issueGuestListTicket, ACCESS_LEVELS } from "@/lib/guest-list";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/guest-list/rsvp/[token] — Fetch RSVP page data (public)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: guest, error } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("id, name, email, access_level, status, qty, event:events(id, name, slug, currency, venue_name, date_start, doors_time)")
      .eq("invite_token", token)
      .single();

    if (error || !guest) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
    }

    // Fetch branding for logo + accent color
    const orgId = guest.org_id as string;
    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${orgId}_branding`)
      .single();

    const brandingData = (brandingRow?.data as Record<string, string>) || {};
    const branding = {
      org_name: brandingData.org_name || orgId,
      logo_url: brandingData.logo_url || null,
      accent_color: brandingData.accent_color || "#8B5CF6",
    };

    const accessLabel = ACCESS_LEVELS[guest.access_level as keyof typeof ACCESS_LEVELS]?.label || "Guest List";

    // Check if already responded
    if (guest.status === "approved") {
      return NextResponse.json({
        guest: { name: guest.name, access_level: guest.access_level, access_label: accessLabel },
        event: guest.event,
        branding,
        status: "approved",
        message: "You're confirmed — check your email for your ticket.",
      });
    }

    if (guest.status === "declined") {
      return NextResponse.json({
        guest: { name: guest.name, access_level: guest.access_level, access_label: accessLabel },
        event: guest.event,
        branding,
        status: "declined",
        message: "You've declined this invitation.",
      });
    }

    return NextResponse.json({
      guest: { name: guest.name, access_level: guest.access_level, access_label: accessLabel, qty: guest.qty },
      event: guest.event,
      branding,
      status: guest.status,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/guest-list/rsvp/[token] — Accept or decline RSVP (public)
 * Body: { action: "accept" | "decline" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { action } = await request.json();

    if (!action || !["accept", "decline"].includes(action)) {
      return NextResponse.json({ error: "Invalid action — must be 'accept' or 'decline'" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: guest, error: gErr } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*, event:events(id, name, slug, currency, venue_name, date_start, doors_time)")
      .eq("invite_token", token)
      .single();

    if (gErr || !guest) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
    }

    // Already finalized
    if (guest.status === "approved") {
      return NextResponse.json({ status: "approved", message: "Already confirmed — check your email for your ticket." });
    }
    if (guest.status === "declined") {
      return NextResponse.json({ status: "declined", message: "Already declined." });
    }

    const orgId = guest.org_id;

    if (action === "decline") {
      await supabase
        .from(TABLES.GUEST_LIST)
        .update({ status: "declined" })
        .eq("id", guest.id)
        .eq("org_id", orgId);

      return NextResponse.json({ status: "declined", message: "Invitation declined." });
    }

    // Accept
    const settings = await getGuestListSettings(supabase, orgId);

    if (settings.auto_approve && guest.email) {
      // Auto-approve: issue ticket immediately
      const event = guest.event as {
        id: string; name: string; slug?: string; currency?: string;
        venue_name?: string; date_start?: string; doors_time?: string;
      };

      try {
        const result = await issueGuestListTicket(supabase, orgId, guest, event, "auto-approve");
        return NextResponse.json({
          status: "approved",
          message: "You're confirmed — your ticket has been sent to your email.",
          orderId: result.orderId,
        });
      } catch (err) {
        console.error("[rsvp] Auto-approve ticket issue failed:", err);
        Sentry.captureException(err);
        // Fall through to just mark as accepted
      }
    }

    // Manual approval required — mark as accepted
    await supabase
      .from(TABLES.GUEST_LIST)
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", guest.id)
      .eq("org_id", orgId);

    return NextResponse.json({
      status: "accepted",
      message: "You're confirmed. We'll send your ticket closer to the event.",
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
