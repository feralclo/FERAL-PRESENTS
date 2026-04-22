import { NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * DELETE /api/rep-portal/devices/[token]
 *
 * Unregister a push token. Idempotent — returns 200 even if the token
 * doesn't exist (the client uninstall / sign-out flow may call us after
 * another path already cleaned up). Scoped to the authenticated rep so
 * nobody can delete another rep's tokens.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { token: rawToken } = await params;
    const token = decodeURIComponent(rawToken).trim();
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { error } = await db
      .from("device_tokens")
      .delete()
      .eq("rep_id", auth.rep.id)
      .eq("token", token);

    if (error) {
      Sentry.captureException(error, {
        extra: { repId: auth.rep.id, token: token.slice(0, 16) + "…" },
      });
      return NextResponse.json(
        { error: "Failed to unregister device" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { unregistered: true } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/devices DELETE] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
