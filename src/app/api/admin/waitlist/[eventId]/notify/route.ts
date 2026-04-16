import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { sendWaitlistNotificationEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "crypto";

/**
 * POST /api/admin/waitlist/[eventId]/notify
 *
 * Body: { count: number } — how many people to notify (default 1)
 *
 * Finds the next N pending signups (oldest first), generates a time-limited
 * token for each, sends notification emails, and returns the results.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { orgId } = auth;
    const { eventId } = await params;

    const body = await request.json().catch(() => ({}));
    const count = Math.min(Math.max(1, Number(body.count) || 1), 50);

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    // Verify event belongs to org
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, venue_name, date_start")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();

    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Fetch next N pending signups
    const { data: pending } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .select("id, email, first_name")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(count);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ notified: 0, message: "No pending signups to notify" });
    }

    const tokenTtlHours = 48;
    const expiresAt = new Date(Date.now() + tokenTtlHours * 60 * 60 * 1000).toISOString();

    // Get the base URL for the notification link
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";

    let notified = 0;
    const results: { email: string; success: boolean }[] = [];

    for (const signup of pending) {
      try {
        const token = randomUUID();

        // Update the signup with token + status
        const { error: updateErr } = await supabase
          .from(TABLES.WAITLIST_SIGNUPS)
          .update({
            status: "notified",
            notification_token: token,
            notified_at: new Date().toISOString(),
            token_expires_at: expiresAt,
          })
          .eq("id", signup.id)
          .eq("status", "pending"); // Only update if still pending (idempotent)

        if (updateErr) {
          console.error(`[waitlist] Failed to update signup ${signup.id}:`, updateErr);
          results.push({ email: signup.email, success: false });
          continue;
        }

        const notificationUrl = `${siteUrl}/event/${event.slug}?wt=${token}`;

        // Send email (intentionally sequential — one email per person, not batched)
        const sent = await sendWaitlistNotificationEmail({
          orgId,
          email: signup.email,
          firstName: signup.first_name || undefined,
          event: {
            name: event.name,
            slug: event.slug,
            venue_name: event.venue_name,
            date_start: event.date_start,
          },
          notificationUrl,
          tokenExpiresAt: expiresAt,
        });

        if (sent) {
          notified++;
          results.push({ email: signup.email, success: true });
        } else {
          results.push({ email: signup.email, success: false });
        }
      } catch (itemErr) {
        console.error(`[waitlist] Error notifying ${signup.email}:`, itemErr);
        results.push({ email: signup.email, success: false });
      }
    }

    return NextResponse.json({ notified, total_pending: pending.length, results });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Waitlist notify error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
