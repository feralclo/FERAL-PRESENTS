import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/uk-events — Events with UK city info for the map view.
 * Returns events that have a city set, with ticket stats.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase)
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { data: events, error } = await supabase
      .from(TABLES.EVENTS)
      .select("id, slug, name, city, venue_name, venue_address, status, cover_image")
      .eq("org_id", orgId)
      .not("city", "is", null)
      .neq("city", "")
      .order("date_start", { ascending: false });

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    return NextResponse.json({ events: events || [] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
