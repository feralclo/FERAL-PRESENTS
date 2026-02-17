import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * GET /api/events/[id]/recent-activity
 * Public endpoint — returns last order timestamp and total sold count.
 * Zero PII. Used by MidnightSocialProof for real-time social proof.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ last_order_at: null, total_sold: 0 });
    }

    // Get most recent completed order for this event
    const { data: recentOrder } = await supabase
      .from(TABLES.ORDERS)
      .select("created_at")
      .eq("event_id", id)
      .eq("org_id", ORG_ID)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get total sold count from ticket_types for this event
    const { data: ticketTypes } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("sold")
      .eq("event_id", id)
      .eq("org_id", ORG_ID);

    const totalSold = (ticketTypes || []).reduce((sum, tt) => sum + (tt.sold || 0), 0);

    return NextResponse.json({
      last_order_at: recentOrder?.created_at || null,
      total_sold: totalSold,
    }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch {
    return NextResponse.json({ last_order_at: null, total_sold: 0 });
  }
}
