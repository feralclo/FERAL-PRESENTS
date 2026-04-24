import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/notifications
 *
 * iOS-shaped notification list (newest first). Different surface from
 * /api/rep-portal/notifications which returns the web-v1 shape — kept
 * separate so either can evolve independently.
 *
 * Response row:
 *   { id, kind, title, body, deep_link, read_at, created_at, metadata }
 *
 * Query: ?limit=50 (1..100) &offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url);

    const [notificationsResult, countResult, unreadResult] = await Promise.all([
      db
        .from(TABLES.REP_NOTIFICATIONS)
        .select("id, type, title, body, link, metadata, read_at, created_at")
        .eq("rep_id", auth.rep.id)
        .eq("org_id", auth.rep.org_id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      db
        .from(TABLES.REP_NOTIFICATIONS)
        .select("id", { count: "exact", head: true })
        .eq("rep_id", auth.rep.id)
        .eq("org_id", auth.rep.org_id),
      db
        .from(TABLES.REP_NOTIFICATIONS)
        .select("id", { count: "exact", head: true })
        .eq("rep_id", auth.rep.id)
        .eq("org_id", auth.rep.org_id)
        .is("read_at", null),
    ]);

    if (notificationsResult.error) {
      return NextResponse.json(
        { error: notificationsResult.error.message },
        { status: 500 }
      );
    }

    type Row = {
      id: string;
      type: string;
      title: string;
      body: string | null;
      link: string | null;
      metadata: Record<string, unknown> | null;
      read_at: string | null;
      created_at: string;
    };

    const items = ((notificationsResult.data ?? []) as Row[]).map((n) => ({
      id: n.id,
      // Rename type → kind for iOS ergonomics. Values are identical to
      // RepNotificationType so iOS's existing enum mapper works unchanged.
      kind: n.type,
      title: n.title,
      body: n.body,
      // Rename link → deep_link for clarity — iOS treats these as
      // in-app router paths (e.g. /rep/profile/<id>).
      deep_link: n.link,
      read_at: n.read_at,
      metadata: n.metadata ?? null,
      created_at: n.created_at,
    }));

    const total = countResult.count ?? items.length;
    const unread = unreadResult.count ?? 0;

    return NextResponse.json({
      data: items,
      total,
      unread_count: unread,
      limit,
      offset,
      has_more: offset + items.length < total,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/notifications] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
