import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * POST /api/platform/payment-health/[id]/resolve
 *
 * Marks a payment event as resolved, with optional notes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const { id } = await params;

  let notes: string | null = null;
  try {
    const body = await request.json();
    notes = body.notes || null;
  } catch {
    // No body or invalid JSON — notes are optional
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const updateData: Record<string, unknown> = {
    resolved: true,
    resolved_at: new Date().toISOString(),
  };
  if (notes) {
    updateData.resolution_notes = notes;
  }

  const { error } = await supabase
    .from(TABLES.PAYMENT_EVENTS)
    .update(updateData)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
