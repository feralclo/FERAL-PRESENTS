import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAnnouncementEmail } from "@/lib/email";
import { TABLES, announcementAutomationKey } from "@/lib/constants";
import type { AnnouncementAutomationSettings } from "@/types/announcements";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for Vercel cron

const DEFAULT_SETTINGS: AnnouncementAutomationSettings = {
  enabled: true,
  step_1_enabled: true,
  step_2_enabled: true,
  step_3_enabled: true,
  step_4_enabled: true,
  step_4_delay_hours: 48,
};

/** Max signups to process per cron run (prevent timeout) */
const BATCH_LIMIT = 100;

/**
 * GET /api/cron/announcement-emails
 *
 * Vercel Cron job (every 5 min) that processes the announcement email sequence.
 * Steps 2-4 are handled here (step 1 is sent synchronously on signup).
 *
 * Multi-tenant: discovers all orgs with pending signups, processes each
 * org's signups using that org's automation settings and email branding.
 */
export async function GET(request: NextRequest) {
  // ── 1. Auth ──
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/announcement-emails] CRON_SECRET not configured");
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
    orgs_processed: 0,
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // ── 2. Discover orgs with signups needing steps 2-4 ──
    const { data: orgRows, error: orgError } = await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .select("org_id")
      .gte("notification_count", 1)
      .lte("notification_count", 3)
      .is("unsubscribed_at", null);

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    const orgIds = [...new Set((orgRows || []).map((r) => r.org_id))];

    if (orgIds.length === 0) {
      return NextResponse.json({ status: "ok", reason: "no pending signups" });
    }

    let totalSent = 0;

    // ── 3. Process each org ──
    for (const orgId of orgIds) {
      if (totalSent >= BATCH_LIMIT) break;
      summary.orgs_processed++;

      // Load automation settings
      const { data: settingsRow } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", announcementAutomationKey(orgId))
        .single();

      const settings: AnnouncementAutomationSettings = settingsRow?.data
        ? { ...DEFAULT_SETTINGS, ...(settingsRow.data as Partial<AnnouncementAutomationSettings>) }
        : DEFAULT_SETTINGS;

      if (!settings.enabled) continue;

      const now = new Date();

      // ── Step 2: Hype email (1h before tickets_live_at) ──
      if (settings.step_2_enabled && totalSent < BATCH_LIMIT) {
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

        const { data: step2Signups } = await supabase
          .from(TABLES.EVENT_INTEREST_SIGNUPS)
          .select(`
            id, email, first_name, notification_count, unsubscribe_token,
            events:event_id ( id, name, slug, venue_name, date_start, tickets_live_at )
          `)
          .eq("org_id", orgId)
          .eq("notification_count", 1)
          .is("unsubscribed_at", null)
          .limit(BATCH_LIMIT - totalSent);

        for (const signup of step2Signups || []) {
          summary.processed++;
          const event = signup.events as unknown as {
            id: string; name: string; slug: string; venue_name?: string;
            date_start?: string; tickets_live_at?: string;
          } | null;

          if (!event?.tickets_live_at || !event.slug) {
            await bumpCount(supabase, signup.id, 1);
            summary.skipped++;
            continue;
          }

          const liveAt = new Date(event.tickets_live_at);
          // Send if tickets go live within the next hour AND haven't gone live yet
          if (liveAt.getTime() <= now.getTime()) {
            // Already past — skip to step 3 processing (will be caught below)
            continue;
          }
          if (liveAt.toISOString() > oneHourFromNow) {
            // More than 1 hour away — not yet
            continue;
          }

          const sent = await sendAnnouncementEmail({
            orgId, email: signup.email, step: 2,
            firstName: signup.first_name || undefined,
            event: { name: event.name, slug: event.slug, venue_name: event.venue_name, date_start: event.date_start, tickets_live_at: event.tickets_live_at },
            unsubscribeToken: signup.unsubscribe_token,
            customSubject: settings.step_2_subject, customHeading: settings.step_2_heading, customBody: settings.step_2_body,
          });
          await bumpCount(supabase, signup.id, 1);
          if (sent) { summary.sent++; totalSent++; } else { summary.errors.push(`[${orgId}] Step 2 failed for ${signup.email}`); }
        }
      }

      // ── Step 3: Tickets live email (at tickets_live_at) ──
      if (settings.step_3_enabled && totalSent < BATCH_LIMIT) {
        // Process notification_count = 2 (normal flow) AND notification_count = 1 if step_2 was disabled and tickets are now live
        const step3Counts = settings.step_2_enabled ? [2] : [1, 2];

        for (const count of step3Counts) {
          const { data: step3Signups } = await supabase
            .from(TABLES.EVENT_INTEREST_SIGNUPS)
            .select(`
              id, email, first_name, notification_count, unsubscribe_token,
              events:event_id ( id, name, slug, venue_name, date_start, tickets_live_at )
            `)
            .eq("org_id", orgId)
            .eq("notification_count", count)
            .is("unsubscribed_at", null)
            .limit(BATCH_LIMIT - totalSent);

          for (const signup of step3Signups || []) {
            summary.processed++;
            const event = signup.events as unknown as {
              id: string; name: string; slug: string; venue_name?: string;
              date_start?: string; tickets_live_at?: string;
            } | null;

            if (!event?.tickets_live_at || !event.slug) {
              // Bump past this step
              await bumpCount(supabase, signup.id, signup.notification_count, 3);
              summary.skipped++;
              continue;
            }

            const liveAt = new Date(event.tickets_live_at);
            if (liveAt.getTime() > now.getTime()) {
              // Tickets not live yet
              continue;
            }

            const sent = await sendAnnouncementEmail({
              orgId, email: signup.email, step: 3,
              firstName: signup.first_name || undefined,
              event: { name: event.name, slug: event.slug, venue_name: event.venue_name, date_start: event.date_start, tickets_live_at: event.tickets_live_at },
              unsubscribeToken: signup.unsubscribe_token,
              customSubject: settings.step_3_subject, customHeading: settings.step_3_heading, customBody: settings.step_3_body,
            });
            await bumpCount(supabase, signup.id, signup.notification_count, 3);
            if (sent) { summary.sent++; totalSent++; } else { summary.errors.push(`[${orgId}] Step 3 failed for ${signup.email}`); }
          }
        }
      } else if (!settings.step_3_enabled && totalSent < BATCH_LIMIT) {
        // Step 3 disabled — bump count=2 signups past live time to 3 so step 4 can process them
        const { data: skipSignups } = await supabase
          .from(TABLES.EVENT_INTEREST_SIGNUPS)
          .select(`id, notification_count, events:event_id ( tickets_live_at )`)
          .eq("org_id", orgId)
          .eq("notification_count", 2)
          .is("unsubscribed_at", null)
          .limit(BATCH_LIMIT);

        for (const signup of skipSignups || []) {
          const event = signup.events as unknown as { tickets_live_at?: string } | null;
          if (event?.tickets_live_at && new Date(event.tickets_live_at).getTime() <= now.getTime()) {
            await bumpCount(supabase, signup.id, 2, 3);
            summary.skipped++;
          }
        }
      }

      // ── Step 4: Final reminder (48h after tickets_live_at) ──
      if (settings.step_4_enabled && totalSent < BATCH_LIMIT) {
        const delayMs = (settings.step_4_delay_hours || 48) * 60 * 60 * 1000;

        const { data: step4Signups } = await supabase
          .from(TABLES.EVENT_INTEREST_SIGNUPS)
          .select(`
            id, email, first_name, customer_id, notification_count, unsubscribe_token,
            events:event_id ( id, name, slug, venue_name, date_start, tickets_live_at )
          `)
          .eq("org_id", orgId)
          .eq("notification_count", 3)
          .is("unsubscribed_at", null)
          .limit(BATCH_LIMIT - totalSent);

        for (const signup of step4Signups || []) {
          summary.processed++;
          const event = signup.events as unknown as {
            id: string; name: string; slug: string; venue_name?: string;
            date_start?: string; tickets_live_at?: string;
          } | null;

          if (!event?.tickets_live_at || !event.slug) {
            await bumpCount(supabase, signup.id, 3);
            summary.skipped++;
            continue;
          }

          const liveAt = new Date(event.tickets_live_at);
          if (now.getTime() - liveAt.getTime() < delayMs) {
            // Not enough time has passed
            continue;
          }

          // ── Suppression: has purchased? ──
          const { data: existingOrder } = await supabase
            .from(TABLES.ORDERS)
            .select("id")
            .eq("customer_id", signup.customer_id)
            .eq("event_id", event.id)
            .neq("status", "refunded")
            .limit(1)
            .single();

          if (existingOrder) {
            await bumpCount(supabase, signup.id, 3);
            summary.skipped++;
            continue;
          }

          // ── Suppression: in abandoned cart flow? ──
          const { data: activeCart } = await supabase
            .from(TABLES.ABANDONED_CARTS)
            .select("id")
            .eq("customer_id", signup.customer_id)
            .eq("event_id", event.id)
            .eq("status", "abandoned")
            .gt("notification_count", 0)
            .is("unsubscribed_at", null)
            .limit(1)
            .single();

          if (activeCart) {
            await bumpCount(supabase, signup.id, 3);
            summary.skipped++;
            continue;
          }

          const sent = await sendAnnouncementEmail({
            orgId, email: signup.email, step: 4,
            firstName: signup.first_name || undefined,
            event: { name: event.name, slug: event.slug, venue_name: event.venue_name, date_start: event.date_start, tickets_live_at: event.tickets_live_at },
            unsubscribeToken: signup.unsubscribe_token,
            customSubject: settings.step_4_subject, customHeading: settings.step_4_heading, customBody: settings.step_4_body,
          });
          await bumpCount(supabase, signup.id, 3);
          if (sent) { summary.sent++; totalSent++; } else { summary.errors.push(`[${orgId}] Step 4 failed for ${signup.email}`); }
        }
      }

      // Also handle disabled steps 2/3 — bump counts for signups stuck at count=1 whose events are past live
      if (!settings.step_2_enabled && totalSent < BATCH_LIMIT) {
        const { data: stuck } = await supabase
          .from(TABLES.EVENT_INTEREST_SIGNUPS)
          .select(`id, notification_count, events:event_id ( tickets_live_at )`)
          .eq("org_id", orgId)
          .eq("notification_count", 1)
          .is("unsubscribed_at", null)
          .limit(BATCH_LIMIT);

        for (const signup of stuck || []) {
          const event = signup.events as unknown as { tickets_live_at?: string } | null;
          if (event?.tickets_live_at && new Date(event.tickets_live_at).getTime() <= now.getTime()) {
            // Bump to 2 (or 3 if step 3 is also disabled)
            const target = settings.step_3_enabled ? 2 : 3;
            await bumpCount(supabase, signup.id, 1, target);
            summary.skipped++;
          }
        }
      }
    }

    console.log("[cron/announcement-emails] Run complete:", summary);
    return NextResponse.json({ status: "ok", ...summary });
  } catch (err) {
    console.error("[cron/announcement-emails] Fatal error:", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}

/** Bump notification_count atomically. */
async function bumpCount(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  signupId: string,
  currentCount: number,
  targetCount?: number,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from(TABLES.EVENT_INTEREST_SIGNUPS)
    .update({
      notification_count: targetCount ?? currentCount + 1,
      notified_at: new Date().toISOString(),
    })
    .eq("id", signupId)
    .eq("notification_count", currentCount); // Guard against race conditions
}
