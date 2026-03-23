import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { issueGuestListTicket, sendGuestListInviteEmail, sendApplicationAcceptanceEmail } from "@/lib/guest-list";
import { toSmallestUnit } from "@/lib/stripe/config";
import type { AccessLevel } from "@/types/orders";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/guest-list/approve — Approve guests
 *
 * For artist-submitted guests (status=pending): sends invite email (RSVP flow).
 * For guests who already RSVP'd (status=accepted): issues ticket directly.
 *
 * Body: { guest_id: string } or { guest_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const guestIds: string[] = body.guest_ids || (body.guest_id ? [body.guest_id] : []);
    const acceptType: "free" | "paid" | undefined = body.accept_type;
    const paymentAmountMajor: number = body.payment_amount || 0; // in major units (e.g., 5 = £5)

    if (guestIds.length === 0) {
      return NextResponse.json({ error: "Missing guest_id or guest_ids" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: guests, error: gErr } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*, event:events(id, name, slug, currency, venue_name, date_start, doors_time)")
      .eq("org_id", orgId)
      .in("id", guestIds);

    if (gErr || !guests) {
      return NextResponse.json({ error: gErr?.message || "Failed to fetch guests" }, { status: 500 });
    }

    const results: { id: string; approved: boolean; action?: string; error?: string }[] = [];

    for (const guest of guests) {
      if (guest.status === "approved") {
        results.push({ id: guest.id, approved: true, action: "already_approved" });
        continue;
      }

      if (!guest.email) {
        results.push({ id: guest.id, approved: false, error: "No email address" });
        continue;
      }

      const event = guest.event as {
        id: string; name: string; slug?: string; currency?: string;
        venue_name?: string; date_start?: string; doors_time?: string;
      } | null;

      if (!event) {
        results.push({ id: guest.id, approved: false, error: "Event not found" });
        continue;
      }

      try {
        // If guest already RSVP'd (accepted), issue ticket directly
        if (guest.status === "accepted") {
          const result = await issueGuestListTicket(
            supabase, orgId, guest, event,
            auth.user?.email || "admin"
          );
          results.push({ id: guest.id, approved: true, action: "ticket_issued" });
          continue;
        }

        // Generate invite token
        let inviteToken = guest.invite_token;
        if (!inviteToken) {
          inviteToken = crypto.randomUUID();
        }

        // Determine payment amount for paid acceptances
        const isPaidAccept = acceptType === "paid" && paymentAmountMajor > 0;
        const paymentAmountSmallest = isPaidAccept
          ? toSmallestUnit(paymentAmountMajor, event.currency || "GBP")
          : 0;

        await supabase
          .from(TABLES.GUEST_LIST)
          .update({
            status: "invited",
            invite_token: inviteToken,
            invited_at: new Date().toISOString(),
            approved_by: auth.user?.email || "admin",
            ...(isPaidAccept ? { payment_amount: paymentAmountSmallest } : {}),
          })
          .eq("id", guest.id)
          .eq("org_id", orgId);

        // Send appropriate email based on acceptance type
        if (isPaidAccept) {
          // Paid acceptance — send acceptance email with payment link
          sendApplicationAcceptanceEmail({
            orgId,
            guestName: guest.name,
            guestEmail: guest.email,
            inviteToken,
            eventName: event.name,
            eventDate: event.date_start || undefined,
            eventTime: event.doors_time || undefined,
            venueName: event.venue_name || undefined,
            accessLevel: (guest.access_level || "guest_list") as AccessLevel,
            paymentAmount: paymentAmountSmallest,
            currency: event.currency || "GBP",
          }).catch((err) => console.error("[approve] Acceptance email failed:", err));
        } else {
          // Free acceptance — send invite email (RSVP flow)
          sendGuestListInviteEmail({
            orgId,
            guestName: guest.name,
            guestEmail: guest.email,
            inviteToken,
            eventName: event.name,
            eventDate: event.date_start || undefined,
            eventTime: event.doors_time || undefined,
            venueName: event.venue_name || undefined,
            accessLevel: (guest.access_level || "guest_list") as AccessLevel,
            addedBy: guest.submitted_by || undefined,
          }).catch((err) => console.error("[approve] Invite email failed:", err));
        }

        results.push({ id: guest.id, approved: true, action: isPaidAccept ? "acceptance_paid_sent" : "invite_sent" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process";
        console.error(`[guest-list-approve] Failed for ${guest.id}:`, err);
        Sentry.captureException(err);
        results.push({ id: guest.id, approved: false, error: message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
