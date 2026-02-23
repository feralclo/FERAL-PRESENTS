import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/notifications — List notifications for current rep
 *
 * Returns notifications (newest first) with unread_count.
 * Query params: ?limit=20&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Fetch notifications and unread count in parallel
    const [notificationsResult, countResult] = await Promise.all([
      supabase
        .from(TABLES.REP_NOTIFICATIONS)
        .select("*")
        .eq("rep_id", repId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),

      supabase
        .from(TABLES.REP_NOTIFICATIONS)
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .eq("org_id", orgId)
        .eq("read", false),
    ]);

    if (notificationsResult.error) {
      return NextResponse.json(
        { error: notificationsResult.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: notificationsResult.data || [],
      unread_count: countResult.count || 0,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
