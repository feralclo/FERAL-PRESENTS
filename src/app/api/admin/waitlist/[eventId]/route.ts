import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/waitlist/[eventId]
 * Returns all waitlist signups for an event, ordered by created_at ASC.
 * Includes position (row number in pending queue).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { orgId } = auth;
    const { eventId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    // Verify event belongs to org
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();

    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { data: signups, error } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .select("id, email, first_name, marketing_consent, status, notified_at, token_expires_at, created_at")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Compute position within the pending queue (1-indexed)
    let pendingPosition = 0;
    const signupsWithPosition = (signups || []).map((s) => {
      if (s.status === "pending" || s.status === "notified") {
        pendingPosition++;
        return { ...s, position: pendingPosition };
      }
      return { ...s, position: null };
    });

    // Summary counts
    const counts = (signups || []).reduce(
      (acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      signups: signupsWithPosition,
      counts: {
        pending: counts.pending || 0,
        notified: counts.notified || 0,
        purchased: counts.purchased || 0,
        expired: counts.expired || 0,
        removed: counts.removed || 0,
        total: (signups || []).length,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
