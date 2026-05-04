import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/spotify/me
 *
 * Connection status for the requesting rep. `connected: false` is a
 * legitimate response (NOT a 404) — iOS's Settings row uses it to swap
 * between "Connect" and "Connected as <name>".
 *
 * Doesn't expose tokens or expiry — those stay server-side.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, must-revalidate" } as const;

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const { data: row } = await db
      .from("spotify_user_tokens")
      .select("display_name, is_premium")
      .eq("rep_id", auth.rep.id)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ data: { connected: false } }, { headers: NO_STORE_HEADERS });
    }

    const r = row as { display_name: string | null; is_premium: boolean | null };
    return NextResponse.json(
      {
        data: {
          connected: true,
          display_name: r.display_name ?? undefined,
          premium: r.is_premium ?? undefined,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/me] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
