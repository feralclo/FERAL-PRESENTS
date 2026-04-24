import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/me/notifications/mark-read
 *
 * Body: { ids: string[] } — mark specific notifications read.
 *       { all: true }     — mark every unread notification for this rep.
 *
 * Writes `read_at = now()`. The DB trigger keeps the legacy `read` bool
 * in sync so the web-v1 portal sees the same state.
 *
 * Response: { data: { marked_read: number } }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const obj = body as Record<string, unknown>;
    const all = obj.all === true;
    const ids = Array.isArray(obj.ids)
      ? (obj.ids.filter((v) => typeof v === "string") as string[])
      : null;

    if (!all && (!ids || ids.length === 0)) {
      return NextResponse.json(
        { error: "Provide { ids: [...] } or { all: true }" },
        { status: 400 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const nowIso = new Date().toISOString();
    let affected = 0;

    if (all) {
      const { data, error } = await db
        .from(TABLES.REP_NOTIFICATIONS)
        .update({ read_at: nowIso })
        .eq("rep_id", auth.rep.id)
        .eq("org_id", auth.rep.org_id)
        .is("read_at", null)
        .select("id");
      if (error) {
        Sentry.captureException(error, { extra: { repId: auth.rep.id, mode: "all" } });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      affected = (data ?? []).length;
    } else {
      const { data, error } = await db
        .from(TABLES.REP_NOTIFICATIONS)
        .update({ read_at: nowIso })
        .in("id", ids!)
        .eq("rep_id", auth.rep.id)
        .eq("org_id", auth.rep.org_id)
        .is("read_at", null)
        .select("id");
      if (error) {
        Sentry.captureException(error, { extra: { repId: auth.rep.id, mode: "ids" } });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      affected = (data ?? []).length;
    }

    return NextResponse.json({ data: { marked_read: affected } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/notifications/mark-read] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
