import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/waitlist/[eventId]/export
 * Returns waitlist signups as CSV.
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

    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, slug, name")
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();

    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { data: signups, error } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .select("email, first_name, marketing_consent, status, notified_at, created_at")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = (signups || []).map((s, i) => [
      i + 1,
      s.email,
      s.first_name || "",
      s.status,
      s.marketing_consent ? "yes" : "no",
      s.notified_at ? new Date(s.notified_at).toISOString() : "",
      new Date(s.created_at).toISOString(),
    ]);

    const csv = [
      ["Position", "Email", "First Name", "Status", "Marketing Consent", "Notified At", "Joined At"].join(","),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const filename = `waitlist-${event.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
