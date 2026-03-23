import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { sendGuestListInviteEmail } from "@/lib/guest-list";
import * as Sentry from "@sentry/nextjs";
import type { AccessLevel } from "@/types/orders";

/**
 * POST /api/guest-list/invite — Send or resend invitation emails
 * Body: { guest_id: string } or { guest_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const guestIds: string[] = body.guest_ids || (body.guest_id ? [body.guest_id] : []);

    if (guestIds.length === 0) {
      return NextResponse.json({ error: "Missing guest_id or guest_ids" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch guest entries
    const { data: guests, error: gErr } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*, event:events(name, venue_name, date_start, doors_time)")
      .eq("org_id", orgId)
      .in("id", guestIds);

    if (gErr || !guests) {
      return NextResponse.json({ error: gErr?.message || "Failed to fetch guests" }, { status: 500 });
    }

    const results: { id: string; sent: boolean; error?: string }[] = [];

    for (const guest of guests) {
      if (!guest.email) {
        results.push({ id: guest.id, sent: false, error: "No email address" });
        continue;
      }

      // Generate invite token if missing
      let inviteToken = guest.invite_token;
      if (!inviteToken) {
        inviteToken = crypto.randomUUID();
        await supabase
          .from(TABLES.GUEST_LIST)
          .update({
            invite_token: inviteToken,
            status: guest.status === "confirmed" ? "invited" : guest.status,
            invited_at: new Date().toISOString(),
          })
          .eq("id", guest.id)
          .eq("org_id", orgId);
      } else {
        // Update invited_at on resend
        await supabase
          .from(TABLES.GUEST_LIST)
          .update({ invited_at: new Date().toISOString() })
          .eq("id", guest.id)
          .eq("org_id", orgId);
      }

      const event = guest.event as { name: string; venue_name?: string; date_start?: string; doors_time?: string } | null;

      // Send email (fire-and-forget per guest)
      sendGuestListInviteEmail({
        orgId,
        guestName: guest.name,
        guestEmail: guest.email,
        inviteToken,
        eventName: event?.name || "Event",
        eventDate: event?.date_start || undefined,
        eventTime: event?.doors_time || undefined,
        venueName: event?.venue_name || undefined,
        accessLevel: (guest.access_level || "guest_list") as AccessLevel,
      }).catch((err) => console.error("[guest-list-invite] Email failed:", err));

      results.push({ id: guest.id, sent: true });
    }

    return NextResponse.json({ results });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
