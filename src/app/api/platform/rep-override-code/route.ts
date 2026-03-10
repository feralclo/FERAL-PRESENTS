import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requirePlatformOwner } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/platform/rep-override-code — Override a rep's discount code
 *
 * Platform owner only. Sets a custom, globally unique discount code for a rep.
 * Body: { repId, orgId, newCode }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { repId, orgId, newCode } = body;

    if (!repId || !orgId || !newCode) {
      return NextResponse.json(
        { error: "repId, orgId, and newCode are required" },
        { status: 400 }
      );
    }

    // Sanitize code
    const code = newCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30);
    if (!code || code.length < 2) {
      return NextResponse.json(
        { error: "Code must be at least 2 alphanumeric characters" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Verify rep exists
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("id, first_name, display_name")
      .eq("id", repId)
      .eq("org_id", orgId)
      .single();

    if (!rep) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // Check global uniqueness — no other discount should have this code
    const { data: conflict } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id, rep_id, org_id")
      .eq("code", code)
      .limit(1)
      .maybeSingle();

    // Get existing discount for this rep
    const { data: existingDiscount } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id, code")
      .eq("rep_id", repId)
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // If conflict exists and it's not this rep's own discount, reject
    if (conflict && conflict.id !== existingDiscount?.id) {
      return NextResponse.json(
        { error: `Code "${code}" is already taken by another discount` },
        { status: 409 }
      );
    }

    if (existingDiscount) {
      // Update existing discount code
      const { error } = await supabase
        .from(TABLES.DISCOUNTS)
        .update({
          code,
          description: `Rep: ${rep.display_name || rep.first_name} (override)`,
        })
        .eq("id", existingDiscount.id);

      if (error) {
        console.error("[platform/rep-override-code] Update error:", error);
        return NextResponse.json({ error: "Failed to update code" }, { status: 500 });
      }

      return NextResponse.json({
        data: { code, previousCode: existingDiscount.code, action: "updated" },
      });
    } else {
      // Create new discount with custom code
      const { data: newDiscount, error } = await supabase
        .from(TABLES.DISCOUNTS)
        .insert({
          org_id: orgId,
          code,
          description: `Rep: ${rep.display_name || rep.first_name} (override)`,
          type: "percentage",
          value: 10,
          used_count: 0,
          applicable_event_ids: null,
          status: "active",
          rep_id: repId,
        })
        .select("id, code")
        .single();

      if (error) {
        console.error("[platform/rep-override-code] Insert error:", error);
        return NextResponse.json({ error: "Failed to create code" }, { status: 500 });
      }

      // Link discount to all rep_events that don't have one
      if (newDiscount) {
        await supabase
          .from(TABLES.REP_EVENTS)
          .update({ discount_id: newDiscount.id })
          .eq("rep_id", repId)
          .eq("org_id", orgId)
          .is("discount_id", null);
      }

      return NextResponse.json({
        data: { code, action: "created" },
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[platform/rep-override-code] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
