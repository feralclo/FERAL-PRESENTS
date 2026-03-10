import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/reps/campaign-events — List all org events with rep_enabled status
 *
 * Returns events with their rep_enabled flag so admins can toggle which
 * events are part of the rep campaign.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: events, error } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, date_start, status, cover_image, rep_enabled")
      .eq("org_id", orgId)
      .in("status", ["draft", "published", "active", "live"])
      .order("date_start", { ascending: false });

    if (error) {
      console.error("[reps/campaign-events] Query error:", error);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    return NextResponse.json({ data: events || [] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/reps/campaign-events — Toggle rep_enabled for an event
 *
 * Body: { eventId: string, rep_enabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const { eventId, rep_enabled } = body;

    if (!eventId || typeof rep_enabled !== "boolean") {
      return NextResponse.json(
        { error: "eventId and rep_enabled (boolean) are required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { error } = await supabase
      .from(TABLES.EVENTS)
      .update({ rep_enabled })
      .eq("id", eventId)
      .eq("org_id", orgId);

    if (error) {
      console.error("[reps/campaign-events] Update error:", error);
      return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }

    return NextResponse.json({ data: { eventId, rep_enabled } });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
