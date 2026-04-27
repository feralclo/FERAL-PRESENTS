import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { createNotification } from "@/lib/rep-notifications";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/event-reminders
 *
 * Hourly cron. For every rep-enabled event whose date_start lands in the
 * 24h or 2h window from now, fan out an `event_reminder` push to every
 * rep on the event-org's team. The rep_event_reminders table dedups via a
 * (rep_id, event_id, kind) unique constraint, so re-running the cron is
 * a no-op.
 *
 * Targeting matches the rep dashboard `events` block:
 *   • event.rep_enabled = true
 *   • event.status in ('published', 'active', 'live')
 *   • approved memberships for event.org_id
 *
 * Window widths are 2h so an hourly cron always catches each event once
 * per kind, even if the cron run drifts by ~30 minutes.
 *
 * Timezone: comparisons run on timestamptz so any TZ on date_start works.
 * "24h" / "2h" are wall-clock-from-now, not local-to-event.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const now = new Date();
  const buckets: Array<{ kind: "24h" | "2h"; from: Date; to: Date }> = [
    {
      kind: "24h",
      from: new Date(now.getTime() + 23 * 3600_000),
      to: new Date(now.getTime() + 25 * 3600_000),
    },
    {
      kind: "2h",
      from: new Date(now.getTime() + 1 * 3600_000),
      to: new Date(now.getTime() + 3 * 3600_000),
    },
  ];

  let totalSent = 0;
  let totalSkipped = 0;
  let totalEvents = 0;

  try {
    for (const bucket of buckets) {
      const { data: events, error: eventsError } = await db
        .from(TABLES.EVENTS)
        .select(
          "id, org_id, name, slug, date_start, venue_name, city, cover_image, cover_image_url"
        )
        .eq("rep_enabled", true)
        .in("status", ["published", "active", "live"])
        .gte("date_start", bucket.from.toISOString())
        .lte("date_start", bucket.to.toISOString());

      if (eventsError) {
        Sentry.captureException(eventsError, {
          extra: { step: "fetch_events", kind: bucket.kind },
        });
        continue;
      }

      if (!events || events.length === 0) continue;
      totalEvents += events.length;

      const orgIds = Array.from(new Set(events.map((e) => e.org_id)));
      // rep_promoter_memberships is keyed by promoter_id, so resolve
      // event.org_id → promoter.id via the promoters table first, then
      // pull memberships in one query.
      const { data: promoters } = await db
        .from("promoters")
        .select("id, org_id, handle, display_name")
        .in("org_id", orgIds);

      const promoterByOrgId = new Map<
        string,
        { id: string; handle: string; display_name: string }
      >();
      for (const p of (promoters ?? []) as Array<{
        id: string;
        org_id: string;
        handle: string;
        display_name: string;
      }>) {
        promoterByOrgId.set(p.org_id, {
          id: p.id,
          handle: p.handle,
          display_name: p.display_name,
        });
      }

      const promoterIds = Array.from(promoterByOrgId.values()).map((p) => p.id);
      if (promoterIds.length === 0) continue;

      const { data: teamRows } = await db
        .from("rep_promoter_memberships")
        .select("rep_id, promoter_id")
        .in("promoter_id", promoterIds)
        .eq("status", "approved");

      const repsByPromoterId = new Map<string, string[]>();
      for (const row of (teamRows ?? []) as Array<{
        rep_id: string;
        promoter_id: string;
      }>) {
        const list = repsByPromoterId.get(row.promoter_id) ?? [];
        list.push(row.rep_id);
        repsByPromoterId.set(row.promoter_id, list);
      }

      for (const event of events) {
        const promoter = promoterByOrgId.get(event.org_id);
        if (!promoter) continue;
        const repIds = repsByPromoterId.get(promoter.id) ?? [];
        if (repIds.length === 0) continue;

        // Pull existing reminders for this event/kind so we can skip reps
        // who have already been notified. Cheaper than insert-then-catch
        // unique-violation per rep.
        const { data: alreadySent } = await db
          .from("rep_event_reminders")
          .select("rep_id")
          .eq("event_id", event.id)
          .eq("kind", bucket.kind)
          .in("rep_id", repIds);

        const sentRepIds = new Set(
          (alreadySent ?? []).map(
            (r) => (r as { rep_id: string }).rep_id,
          ),
        );

        const targets = repIds.filter((id) => !sentRepIds.has(id));
        totalSkipped += repIds.length - targets.length;
        if (targets.length === 0) continue;

        // Insert dedup rows first. The unique (rep_id, event_id, kind)
        // index is the source of truth — if two cron runs race, only one
        // INSERT survives and only that one fires the push. Use upsert
        // with ignoreDuplicates so a partial overlap doesn't error.
        const { data: insertedRows, error: insertError } = await db
          .from("rep_event_reminders")
          .upsert(
            targets.map((rep_id) => ({
              rep_id,
              event_id: event.id,
              kind: bucket.kind,
            })),
            { onConflict: "rep_id,event_id,kind", ignoreDuplicates: true },
          )
          .select("rep_id");

        if (insertError) {
          Sentry.captureException(insertError, {
            extra: { step: "insert_reminders", event_id: event.id, kind: bucket.kind },
          });
          continue;
        }

        const newlyClaimed = (insertedRows ?? []).map(
          (r) => (r as { rep_id: string }).rep_id,
        );
        if (newlyClaimed.length === 0) continue;

        const eventDate = new Date(event.date_start);
        const venueLabel =
          event.venue_name && event.city
            ? `${event.venue_name}, ${event.city}`
            : event.venue_name || event.city || null;
        const title =
          bucket.kind === "2h"
            ? `${event.name} starts soon`
            : `${event.name} is tomorrow`;
        const body =
          venueLabel != null ? venueLabel : "Tap for details.";

        for (const repId of newlyClaimed) {
          createNotification({
            repId,
            orgId: event.org_id,
            type: "event_reminder",
            title,
            body,
            link: `/rep/events/${event.id}`,
            metadata: {
              event_id: event.id,
              event_slug: event.slug,
              promoter_id: promoter.id,
              promoter_handle: promoter.handle,
              kind: bucket.kind,
              date_start: eventDate.toISOString(),
              cover_image_url:
                event.cover_image_url ?? event.cover_image ?? null,
            },
          }).catch((err) =>
            Sentry.captureException(err, { level: "warning" }),
          );
          totalSent += 1;
        }
      }
    }

    return NextResponse.json({
      events_in_window: totalEvents,
      reminders_sent: totalSent,
      reminders_skipped: totalSkipped,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: "Failed", details: (err as Error).message },
      { status: 500 },
    );
  }
}
