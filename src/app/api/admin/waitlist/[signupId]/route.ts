import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * DELETE /api/admin/waitlist/[signupId]
 * Soft-removes a waitlist signup (status → removed).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ signupId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { orgId } = auth;
    const { signupId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { error } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .update({ status: "removed" })
      .eq("id", signupId)
      .eq("org_id", orgId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
