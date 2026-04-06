import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * POST /api/scanner/live/validate — Validate a live scanner token.
 * Returns event info without performing a scan.
 * Body: { token: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let body: { token?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Find matching token across all orgs
    const { data: rows } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("key, data")
      .like("key", "%_scanner_live_tokens");

    if (!rows) {
      return NextResponse.json({ error: "Invalid scanner token" }, { status: 403 });
    }

    for (const row of rows) {
      const tokens = row.data as { token: string; event_id: string; event_name: string }[];
      if (!Array.isArray(tokens)) continue;
      const match = tokens.find((t) => t.token === body.token);
      if (match) {
        return NextResponse.json({
          valid: true,
          event_id: match.event_id,
          event_name: match.event_name,
        });
      }
    }

    return NextResponse.json({ error: "Invalid scanner token" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
