import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/announcement/signups
 *
 * Admin endpoint to list interest signups for an event.
 * Query params: event_id (required), count_only (optional), page, limit
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const eventId = searchParams.get("event_id");

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  // Stats mode: aggregate email metrics across all events for the org
  const statsMode = searchParams.get("stats") === "true";

  if (statsMode) {
    const { data: allSignups, error: statsErr } = await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .select("notification_count, unsubscribed_at")
      .eq("org_id", auth.orgId);

    if (statsErr) {
      return NextResponse.json({ error: statsErr.message }, { status: 500 });
    }

    const signups = allSignups || [];
    const stats = {
      total_signups: signups.length,
      emails_sent: {
        step_1: signups.filter((s) => s.notification_count >= 1).length,
        step_2: signups.filter((s) => s.notification_count >= 2).length,
        step_3: signups.filter((s) => s.notification_count >= 3).length,
        step_4: signups.filter((s) => s.notification_count >= 4).length,
      },
      unsubscribed: signups.filter((s) => s.unsubscribed_at).length,
    };

    return NextResponse.json(stats);
  }

  if (!eventId) {
    return NextResponse.json(
      { error: "event_id is required" },
      { status: 400 }
    );
  }

  const countOnly = searchParams.get("count_only") === "true";

  if (countOnly) {
    const { count, error } = await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", auth.orgId)
      .eq("event_id", eventId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0 });
  }

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from(TABLES.EVENT_INTEREST_SIGNUPS)
    .select("id, email, first_name, signed_up_at, notified_at, customer_id", {
      count: "exact",
    })
    .eq("org_id", auth.orgId)
    .eq("event_id", eventId)
    .order("signed_up_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    limit,
  });
}
