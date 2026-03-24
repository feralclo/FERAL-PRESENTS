import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendGuestListReminderEmail } from "@/lib/guest-list";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Send reminder after 48 hours of no response */
const REMINDER_DELAY_HOURS = 48;

/** Don't send reminders if the event is less than 24 hours away */
const EVENT_CUTOFF_HOURS = 24;

/** Max guests to process per run (prevent timeout) */
const BATCH_LIMIT = 200;

/**
 * GET /api/cron/guest-list-reminders
 *
 * Vercel Cron job that sends a single reminder email to guests who were
 * invited 48+ hours ago but haven't accepted. Skips events starting
 * within 24 hours. Multi-tenant: processes all orgs.
 */
export async function GET(request: NextRequest) {
  // ── 1. Auth ──
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/guest-list-reminders] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const summary = {
    processed: 0,
    sent: 0,
    skipped_no_email: 0,
    skipped_event_soon: 0,
    skipped_event_past: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // ── 2. Find invited guests past the 48h window with no reminder sent ──
    const reminderThreshold = new Date(
      Date.now() - REMINDER_DELAY_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Use invited_at if available, fall back to created_at
    // Query: status = "invited", no reminder sent yet, invited/created before threshold
    const { data: guests, error: guestError } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("id, org_id, event_id, name, email, invite_token, access_level, source, invited_at, created_at")
      .eq("status", "invited")
      .is("reminder_sent_at", null)
      .not("email", "is", null)
      .not("invite_token", "is", null)
      .lt("created_at", reminderThreshold)
      .limit(BATCH_LIMIT);

    if (guestError) {
      console.error("[cron/guest-list-reminders] Query error:", guestError.message);
      return NextResponse.json({ error: guestError.message }, { status: 500 });
    }

    if (!guests || guests.length === 0) {
      return NextResponse.json({ status: "ok", reason: "no pending reminders", ...summary });
    }

    // ── 3. Fetch event details for all relevant events ──
    const eventIds = [...new Set(guests.map((g) => g.event_id))];
    const { data: events } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, date, end_date, venue_name")
      .in("id", eventIds);

    const eventMap = new Map(
      (events || []).map((e) => [e.id, e]),
    );

    const now = Date.now();
    const eventCutoff = EVENT_CUTOFF_HOURS * 60 * 60 * 1000;

    // ── 4. Process each guest ──
    for (const guest of guests) {
      summary.processed++;

      if (!guest.email) {
        summary.skipped_no_email++;
        continue;
      }

      const event = eventMap.get(guest.event_id);
      if (!event) {
        summary.skipped_event_past++;
        continue;
      }

      // Skip if event has already passed
      const eventDate = new Date(event.end_date || event.date).getTime();
      if (eventDate < now) {
        summary.skipped_event_past++;
        continue;
      }

      // Skip if event is less than 24 hours away
      if (eventDate - now < eventCutoff) {
        summary.skipped_event_soon++;
        continue;
      }

      // Double-check: use invited_at if available, otherwise created_at
      const invitedTime = new Date(guest.invited_at || guest.created_at).getTime();
      if (now - invitedTime < REMINDER_DELAY_HOURS * 60 * 60 * 1000) {
        continue; // Not yet past the 48h window
      }

      try {
        // Send reminder
        await sendGuestListReminderEmail({
          orgId: guest.org_id,
          guestName: guest.name,
          guestEmail: guest.email,
          inviteToken: guest.invite_token,
          eventName: event.name,
          eventDate: event.date,
          venueName: event.venue_name,
          accessLevel: guest.access_level,
          source: guest.source || "direct",
        });

        // Mark reminder as sent (atomic — guard against race conditions)
        const { error: updateError } = await supabase
          .from(TABLES.GUEST_LIST)
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", guest.id)
          .eq("status", "invited")
          .is("reminder_sent_at", null);

        if (updateError) {
          console.error(`[cron/guest-list-reminders] Failed to mark reminder for ${guest.id}:`, updateError.message);
          summary.failed++;
        } else {
          summary.sent++;
        }
      } catch (err) {
        summary.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push(`${guest.id}: ${msg}`);
        Sentry.captureException(err, {
          tags: { cron: "guest-list-reminders", org_id: guest.org_id },
          extra: { guest_id: guest.id, event_id: guest.event_id },
        });
      }
    }

    console.log(`[cron/guest-list-reminders] Done — sent: ${summary.sent}, skipped_soon: ${summary.skipped_event_soon}, skipped_past: ${summary.skipped_event_past}, failed: ${summary.failed}`);
    return NextResponse.json({ status: "ok", ...summary });
  } catch (err) {
    console.error("[cron/guest-list-reminders] Unexpected error:", err);
    Sentry.captureException(err, { tags: { cron: "guest-list-reminders" } });
    return NextResponse.json(
      { error: "Internal error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
