import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/guest-list/event-summary — Per-event guest counts for the event selector
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: rows } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("event_id, status, qty")
      .eq("org_id", orgId);

    // Aggregate per event
    const summaries: Record<string, { total_guests: number; pending_count: number }> = {};

    for (const row of rows || []) {
      const eid = row.event_id as string;
      if (!summaries[eid]) {
        summaries[eid] = { total_guests: 0, pending_count: 0 };
      }
      summaries[eid].total_guests += (row.qty as number) || 1;
      const status = (row.status as string) || "confirmed";
      if (status === "pending" || status === "accepted") {
        summaries[eid].pending_count++;
      }
    }

    return NextResponse.json({ summaries });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
