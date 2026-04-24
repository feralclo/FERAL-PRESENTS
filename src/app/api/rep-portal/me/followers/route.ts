import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listFollowersOf, parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/followers
 *
 * Paginated list of reps who follow the authenticated rep. Each row
 * carries the viewer's follow state so the client can render
 * Follow / Following / Friend buttons in one pass.
 *
 * Query: ?limit=50 (1..100) &offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url);
    const envelope = await listFollowersOf(db, auth.rep.id, auth.rep.id, limit, offset);

    return NextResponse.json(envelope);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/followers] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
