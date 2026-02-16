import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/discount — Get rep's discount code(s) (protected)
 *
 * Returns all discount codes assigned to the current rep.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: discounts, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id, code, type, value, status, used_count, max_uses, applicable_event_ids, created_at")
      .eq("rep_id", repId)
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[rep-portal/discount] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch discount codes" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: discounts || [] });
  } catch (err) {
    console.error("[rep-portal/discount] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
