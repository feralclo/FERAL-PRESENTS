import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { sendGuestListInviteEmail } from "@/lib/guest-list";
import * as Sentry from "@sentry/nextjs";
import type { AccessLevel } from "@/types/orders";

/**
 * POST /api/guest-list — Add a guest list entry
 *
 * New fields: access_level, send_invite.
 * If email provided + send_invite=true: sends invitation email, status='invited'.
 * If no email: status='confirmed' (walk-up guest).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      event_id,
      name,
      email,
      phone,
      qty = 1,
      added_by,
      notes,
      access_level = "guest_list",
      send_invite = false,
    } = body;

    if (!event_id || !name) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, name" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Determine status based on email + invite preference
    const hasEmail = !!email?.trim();
    const shouldInvite = hasEmail && send_invite;
    const inviteToken = shouldInvite ? crypto.randomUUID() : null;

    const { data, error } = await supabase
      .from(TABLES.GUEST_LIST)
      .insert({
        org_id: orgId,
        event_id,
        name,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        qty,
        added_by: added_by || null,
        notes: notes || null,
        access_level: access_level as AccessLevel,
        status: shouldInvite ? "invited" : "confirmed",
        invite_token: inviteToken,
        invited_at: shouldInvite ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send invitation email (fire-and-forget)
    if (shouldInvite && inviteToken) {
      // Fetch event details for the email
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("name, venue_name, date_start, doors_time")
        .eq("id", event_id)
        .eq("org_id", orgId)
        .single();

      if (event) {
        sendGuestListInviteEmail({
          orgId,
          guestName: name,
          guestEmail: email.trim(),
          inviteToken,
          eventName: event.name,
          eventDate: event.date_start || undefined,
          eventTime: event.doors_time || undefined,
          venueName: event.venue_name || undefined,
          accessLevel: access_level as AccessLevel,
          addedBy: added_by || undefined,
        }).catch((err) => console.error("[guest-list] Email send failed:", err));
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
