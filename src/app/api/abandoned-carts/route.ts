import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/abandoned-carts — List abandoned carts with stats
 *
 * Query params:
 *   status   — filter by status (abandoned, recovered, expired). Default: all.
 *   event_id — filter by event
 *   search   — search by email or name
 *   page     — pagination (default 1)
 *   limit    — items per page (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const eventId = searchParams.get("event_id");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    let query = supabase
      .from(TABLES.ABANDONED_CARTS)
      .select(
        "*, customer:customers(*), event:events(name, slug, date_start)",
        { count: "exact" }
      )
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    if (search) {
      query = query.or(
        `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also fetch aggregate stats
    const { data: allCarts } = await supabase
      .from(TABLES.ABANDONED_CARTS)
      .select("status, subtotal")
      .eq("org_id", ORG_ID);

    const stats = {
      total: allCarts?.length || 0,
      abandoned: allCarts?.filter((c: { status: string }) => c.status === "abandoned").length || 0,
      recovered: allCarts?.filter((c: { status: string }) => c.status === "recovered").length || 0,
      total_value: allCarts
        ?.filter((c: { status: string }) => c.status === "abandoned")
        .reduce((sum: number, c: { subtotal: number }) => sum + Number(c.subtotal), 0) || 0,
      recovered_value: allCarts
        ?.filter((c: { status: string }) => c.status === "recovered")
        .reduce((sum: number, c: { subtotal: number }) => sum + Number(c.subtotal), 0) || 0,
    };

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      stats,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
