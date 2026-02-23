import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/abandoned-carts — List abandoned carts with stats
 *
 * Query params:
 *   status   — filter by status (pending, abandoned, recovered, expired). Default: all.
 *   event_id — filter by event
 *   search   — search by email or name
 *   page     — pagination (default 1)
 *   limit    — items per page (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
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
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    // No default exclusion — show all carts including "pending" so admin
    // has immediate visibility into carts waiting to be promoted.

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    if (search) {
      // Sanitize search term: escape characters that have special meaning in PostgREST filters
      const sanitized = search.replace(/[\\%_(),."']/g, "");
      if (sanitized) {
        query = query.or(
          `email.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch aggregate stats (all carts including pending for full visibility)
    const { data: allCarts } = await supabase
      .from(TABLES.ABANDONED_CARTS)
      .select("status, subtotal, notification_count")
      .eq("org_id", orgId);

    type CartRow = { status: string; subtotal: number; notification_count: number };

    const pending = allCarts?.filter((c: CartRow) => c.status === "pending") || [];
    const nonPending = allCarts?.filter((c: CartRow) => c.status !== "pending") || [];

    const stats = {
      total: nonPending.length,
      pending: pending.length,
      abandoned: nonPending.filter((c: CartRow) => c.status === "abandoned").length,
      recovered: nonPending.filter((c: CartRow) => c.status === "recovered").length,
      total_value: nonPending
        .filter((c: CartRow) => c.status === "abandoned")
        .reduce((sum: number, c: CartRow) => sum + Number(c.subtotal), 0),
      recovered_value: nonPending
        .filter((c: CartRow) => c.status === "recovered")
        .reduce((sum: number, c: CartRow) => sum + Number(c.subtotal), 0),
    };

    // Per-step pipeline stats: how many emails sent per step and recoveries after each
    const pipeline = [1, 2, 3].map((step) => {
      const sent = nonPending.filter((c: CartRow) => c.notification_count >= step).length;
      const recoveredAfter = nonPending.filter(
        (c: CartRow) => c.status === "recovered" && c.notification_count === step
      ).length;
      const recoveredValue = nonPending
        .filter((c: CartRow) => c.status === "recovered" && c.notification_count === step)
        .reduce((sum: number, c: CartRow) => sum + Number(c.subtotal), 0);
      return { step, sent, recovered: recoveredAfter, recovered_value: recoveredValue };
    });

    // Carts recovered without any email (notification_count === 0)
    const recoveredWithoutEmail = nonPending.filter(
      (c: CartRow) => c.status === "recovered" && c.notification_count === 0
    ).length;

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      stats,
      pipeline,
      recovered_without_email: recoveredWithoutEmail,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
