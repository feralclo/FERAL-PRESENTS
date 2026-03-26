import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, campaignSendsKey } from "@/lib/constants";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * GET /api/campaigns/track — Track email opens and clicks
 *
 * Public endpoint (embedded in campaign emails).
 *
 * Query params:
 *   t  — "open" | "click"
 *   s  — send_id
 *   r  — redirect URL (for clicks)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("t");
  const sendId = searchParams.get("s");
  const redirect = searchParams.get("r");

  if (sendId) {
    // Fire-and-forget — don't block the response
    trackEvent(sendId, type === "click" ? "click" : "open").catch(() => {});
  }

  if (type === "click" && redirect) {
    return NextResponse.redirect(redirect, 302);
  }

  // Return tracking pixel for opens
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

async function trackEvent(sendId: string, type: "open" | "click") {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  // Find the send record across all orgs
  const { data: rows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .like("key", "%_campaign_sends");

  if (!rows) return;

  for (const row of rows) {
    const sends = (row.data as CampaignSend[]) || [];
    const send = sends.find((s) => s.id === sendId);
    if (!send) continue;

    // Increment counter
    if (type === "open") {
      send.opens = (send.opens || 0) + 1;
    } else {
      send.clicks = (send.clicks || 0) + 1;
    }
    send.last_activity = new Date().toISOString();

    await supabase
      .from(TABLES.SITE_SETTINGS)
      .update({ data: sends })
      .eq("key", row.key);

    return;
  }
}

interface CampaignSend {
  id: string;
  type: string;
  event_id: string;
  event_name: string;
  sent_at: string;
  sent_count: number;
  opens: number;
  clicks: number;
  last_activity?: string;
}
