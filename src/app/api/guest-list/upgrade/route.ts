import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import {
  upgradeGuestAccessLevel,
  sendGuestListUpgradeEmail,
} from "@/lib/guest-list";
import type { AccessLevel } from "@/types/orders";
import * as Sentry from "@sentry/nextjs";

const VALID_ACCESS_LEVELS: AccessLevel[] = [
  "guest_list",
  "vip",
  "backstage",
  "aaa",
  "artist",
];

/**
 * POST /api/guest-list/upgrade — Upgrade a guest's access level
 *
 * Keeps the same QR code (ticket_code). Updates ticket_type_id, order_items,
 * and guest_list entry. Sends an upgrade notification email.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const { guest_id, new_access_level } = body as {
      guest_id?: string;
      new_access_level?: string;
    };

    if (!guest_id) {
      return NextResponse.json(
        { error: "Missing guest_id" },
        { status: 400 }
      );
    }

    if (
      !new_access_level ||
      !VALID_ACCESS_LEVELS.includes(new_access_level as AccessLevel)
    ) {
      return NextResponse.json(
        { error: "Invalid new_access_level" },
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

    // Perform the upgrade (updates guest_list, tickets, order_items)
    const { guest, previousLevel } = await upgradeGuestAccessLevel(
      supabase,
      orgId,
      guest_id,
      new_access_level as AccessLevel,
      auth.user?.email || "admin"
    );

    // Fetch event details for emails
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, currency, venue_name, date_start, doors_time")
      .eq("id", guest.event_id)
      .single();

    if (!event) {
      // Upgrade succeeded but we can't send emails without event data
      return NextResponse.json({
        success: true,
        previous_level: previousLevel,
        new_level: new_access_level,
        email_sent: false,
        message: "Access level upgraded but event not found for email",
      });
    }

    // Send upgrade notification email
    if (guest.email) {
      await sendGuestListUpgradeEmail({
        orgId,
        guestName: guest.name,
        guestEmail: guest.email,
        eventName: event.name,
        eventDate: event.date_start || undefined,
        eventTime: event.doors_time || undefined,
        venueName: event.venue_name || undefined,
        previousLevel,
        newLevel: new_access_level as AccessLevel,
      });
    }

    return NextResponse.json({
      success: true,
      previous_level: previousLevel,
      new_level: new_access_level,
      email_sent: !!guest.email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";

    // Known validation errors → 400
    if (
      message.includes("not found") ||
      message.includes("already has") ||
      message.includes("does not have a ticket")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    Sentry.captureException(err);
    console.error("[guest-list-upgrade] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
