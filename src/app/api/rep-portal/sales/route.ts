import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/sales — Sales for current rep (protected)
 *
 * Returns orders attributed to this rep via metadata->>rep_id.
 * Optionally filtered by event_id.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50", 10)), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from(TABLES.ORDERS)
      .select(
        "id, order_number, total, subtotal, fees, status, created_at, event:events(id, name, slug)",
        { count: "exact" }
      )
      .eq("org_id", ORG_ID)
      .eq("metadata->>rep_id", repId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[rep-portal/sales] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch sales" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[rep-portal/sales] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
