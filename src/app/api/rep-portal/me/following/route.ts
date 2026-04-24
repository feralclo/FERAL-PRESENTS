import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listFollowingOf, parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/following
 *
 * Paginated list of reps the authenticated rep is following.
 * See /me/following/promoters for the promoter-following list.
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
    const envelope = await listFollowingOf(db, auth.rep.id, auth.rep.id, limit, offset);

    return NextResponse.json(envelope);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/following] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
