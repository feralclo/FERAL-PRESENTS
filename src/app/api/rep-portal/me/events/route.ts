import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAttendedEventsOf, parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/events
 *
 * Events the authenticated rep has attended — a rep is counted as having
 * attended an event once any ticket they hold (matched by holder_email
 * → reps.email in the same org) is issued for that event. Populated by
 * an AFTER INSERT trigger on tickets; backfilled from history.
 *
 * Returned newest-first. Per product: surfacing the count on the rep
 * profile is deferred until the platform has more traffic — but the
 * list endpoint is live so iOS can populate drill-ins as soon as we
 * decide to show it.
 *
 * Query: ?limit=50 (1..100) &offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url);
    const envelope = await listAttendedEventsOf(db, auth.rep.id, limit, offset);

    return NextResponse.json(envelope);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/events] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
