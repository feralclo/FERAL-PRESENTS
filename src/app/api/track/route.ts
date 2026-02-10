import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * POST /api/track
 * Server-side traffic event tracking.
 * Future: will also handle server-side conversion tracking (Meta CAPI, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, ...eventData } = body;

    const tableName =
      table === "popup" ? TABLES.POPUP_EVENTS : TABLES.TRAFFIC_EVENTS;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { error } = await supabase
      .from(tableName)
      .insert({ ...eventData, org_id: ORG_ID });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
