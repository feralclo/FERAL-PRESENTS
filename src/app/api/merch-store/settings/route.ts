import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, merchStoreKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import { DEFAULT_MERCH_STORE_SETTINGS } from "@/types/merch-store";

/**
 * GET /api/merch-store/settings — Public: returns merch store settings for the org
 */
export async function GET() {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", merchStoreKey(orgId))
      .single();

    return NextResponse.json({
      data: { ...DEFAULT_MERCH_STORE_SETTINGS, ...(data?.data || {}) },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/merch-store/settings — Admin: update merch store settings
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const settings = {
      ...DEFAULT_MERCH_STORE_SETTINGS,
      ...body,
    };

    const { error } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        { key: merchStoreKey(orgId), data: settings, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: settings });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
