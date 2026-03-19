import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, scannerAssignmentsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/scanner/assignments — Return scanner event assignments for the org.
 * Requires admin auth.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", scannerAssignmentsKey(auth.orgId))
      .single();

    return NextResponse.json({
      assignments: data?.data?.assignments || {},
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/scanner/assignments — Save scanner event assignments for a user.
 * Body: { user_id: string, event_ids: string[] }
 * Requires admin auth + owner role.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Verify owner
    const { data: orgUser } = await supabase
      .from(TABLES.ORG_USERS)
      .select("role")
      .eq("auth_user_id", auth.user.id)
      .eq("org_id", auth.orgId)
      .single();

    if (orgUser?.role !== "owner") {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
    }

    const { user_id, event_ids } = await request.json();
    if (!user_id) {
      return NextResponse.json(
        { error: "user_id required" },
        { status: 400 }
      );
    }

    const key = scannerAssignmentsKey(auth.orgId);

    // Fetch current assignments
    const { data: existing } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    const current = existing?.data || { assignments: {} };
    if (!current.assignments) {
      current.assignments = {};
    }

    // Update the specific user's assignment
    if (event_ids && event_ids.length > 0) {
      current.assignments[user_id] = event_ids;
    } else {
      delete current.assignments[user_id];
    }

    // Upsert
    await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        { key, data: current, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
