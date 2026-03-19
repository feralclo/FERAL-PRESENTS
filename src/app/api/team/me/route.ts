import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/team/me — Get the current user's org_users record (role + permissions).
 * Used by the admin layout to determine if a scanner-only user should be
 * redirected away from the full dashboard.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data, error } = await supabase
      .from(TABLES.ORG_USERS)
      .select("role, perm_events, perm_orders, perm_marketing, perm_finance, perm_reps")
      .eq("auth_user_id", auth.user.id)
      .eq("org_id", auth.orgId)
      .eq("status", "active")
      .single();

    if (error || !data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
