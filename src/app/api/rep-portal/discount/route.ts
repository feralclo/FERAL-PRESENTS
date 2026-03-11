import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getOrCreateRepDiscount } from "@/lib/discount-codes";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/discount — Get rep's discount code(s) (protected)
 *
 * Returns all discount codes assigned to the current rep.
 * If no discount exists yet, creates one automatically.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth({ allowPending: true });
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

    let { data: discounts, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id, code, type, value, status, used_count, max_uses, applicable_event_ids, created_at")
      .eq("rep_id", repId)
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[rep-portal/discount] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch discount codes" },
        { status: 500 }
      );
    }

    // If no discount exists, create one lazily
    if (!discounts || discounts.length === 0) {
      const { data: rep } = await supabase
        .from(TABLES.REPS)
        .select("first_name, display_name")
        .eq("id", repId)
        .single();

      const created = await getOrCreateRepDiscount({
        repId,
        orgId,
        firstName: rep?.first_name || "Rep",
        displayName: rep?.display_name,
      });

      if (created) {
        // Re-fetch so the response shape is consistent
        const { data: refreshed } = await supabase
          .from(TABLES.DISCOUNTS)
          .select("id, code, type, value, status, used_count, max_uses, applicable_event_ids, created_at")
          .eq("id", created.id)
          .single();

        discounts = refreshed ? [refreshed] : [];
      }
    }

    return NextResponse.json({ data: discounts || [] });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/discount] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
