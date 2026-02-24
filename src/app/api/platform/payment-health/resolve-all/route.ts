import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * POST /api/platform/payment-health/resolve-all
 *
 * Bulk-resolve payment events by severity or type.
 * Body: { severity?: "warning" | "critical", type?: string, notes?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let severity: string | undefined;
  let type: string | undefined;
  let notes: string | undefined;

  try {
    const body = await request.json();
    severity = body.severity;
    type = body.type;
    notes = body.notes;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Must provide at least severity or type filter — prevent accidental mass-resolve
  if (!severity && !type) {
    return NextResponse.json(
      { error: "Must specify severity or type filter" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {
    resolved: true,
    resolved_at: new Date().toISOString(),
  };
  if (notes) {
    updateData.resolution_notes = notes;
  }

  let query = supabase
    .from(TABLES.PAYMENT_EVENTS)
    .update(updateData, { count: "exact" })
    .eq("resolved", false);

  if (severity) {
    query = query.eq("severity", severity);
  }
  if (type) {
    query = query.eq("type", type);
  }

  const { count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resolved_count: count || 0 });
}
