import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, campaignSendsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/campaigns/sends — List campaign send history with open/click stats
 *
 * Query params:
 *   event_id — optional, filter sends by event
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const eventId = request.nextUrl.searchParams.get("event_id");

  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", campaignSendsKey(auth.orgId))
    .single();

  let sends = ((data?.data as unknown[]) || []) as {
    id: string;
    type: string;
    event_id: string;
    event_name: string;
    sent_at: string;
    sent_count: number;
    opens: number;
    clicks: number;
  }[];

  if (eventId) {
    sends = sends.filter((s) => s.event_id === eventId);
  }

  return NextResponse.json({ sends });
}
