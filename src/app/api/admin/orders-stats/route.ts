import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/admin/orders-stats — Period-filtered order stats (bypasses RLS)
 *
 * Query params:
 *   from — ISO date string for period start (required)
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
    const from = searchParams.get("from");

    if (!from) {
      return NextResponse.json(
        { error: "Missing 'from' parameter" },
        { status: 400 }
      );
    }

    const { data: completedOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("id, total")
      .eq("org_id", orgId)
      .eq("status", "completed")
      .gte("created_at", from);

    const ords = completedOrders || [];

    const { count: ticketCount } = await supabase
      .from(TABLES.TICKETS)
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", from);

    const orderIds = ords.map((o) => o.id);
    let merchRevenue = 0;
    let merchItems = 0;

    if (orderIds.length > 0) {
      const { data: merch } = await supabase
        .from(TABLES.ORDER_ITEMS)
        .select("unit_price, qty")
        .eq("org_id", orgId)
        .in("order_id", orderIds)
        .not("merch_size", "is", null);

      const items = merch || [];
      merchRevenue = items.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
      merchItems = items.reduce((s, i) => s + i.qty, 0);
    }

    return NextResponse.json({
      orderCount: ords.length,
      revenue: ords.reduce((s, o) => s + Number(o.total), 0),
      ticketsSold: ticketCount || 0,
      merchRevenue,
      merchItems,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
