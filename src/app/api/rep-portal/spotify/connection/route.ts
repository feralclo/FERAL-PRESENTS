import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptToken, revokeTokensBestEffort } from "@/lib/spotify/user-auth";
import * as Sentry from "@sentry/nextjs";

/**
 * DELETE /api/rep-portal/spotify/connection
 *
 * Disconnect the rep's Spotify account. Best-effort token revocation
 * (Spotify doesn't currently expose a public revoke endpoint — the call
 * is a no-op for now and exists so we have a single hook when they ship
 * one), then delete the row.
 *
 * Idempotent — calling DELETE on a rep without a connection succeeds with
 * `removed: false`.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, must-revalidate" } as const;

export async function DELETE(_request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const { data: row } = await db
      .from("spotify_user_tokens")
      .select("access_token, refresh_token")
      .eq("rep_id", auth.rep.id)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ data: { removed: false } }, { headers: NO_STORE_HEADERS });
    }

    const r = row as { access_token: string; refresh_token: string };

    // Best-effort revoke before delete. Errors are swallowed inside the
    // helper so a Spotify outage never blocks disconnection.
    try {
      const access = decryptToken(r.access_token);
      const refresh = decryptToken(r.refresh_token);
      await revokeTokensBestEffort(access, refresh);
    } catch (err) {
      Sentry.captureException(err, { level: "warning" });
    }

    const { error } = await db
      .from("spotify_user_tokens")
      .delete()
      .eq("rep_id", auth.rep.id);

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json({ error: "Failed to disconnect" }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ data: { removed: true } }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/connection] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
