import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * DELETE /api/admin/waitlist/[eventId]/signups/[signupId]
 * Soft-removes a waitlist signup (status → "removed").
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; signupId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { orgId } = auth;
    const { eventId, signupId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    // Verify event belongs to org
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();

    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { error } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .update({ status: "removed", updated_at: new Date().toISOString() })
      .eq("id", signupId)
      .eq("org_id", orgId)
      .eq("event_id", eventId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
