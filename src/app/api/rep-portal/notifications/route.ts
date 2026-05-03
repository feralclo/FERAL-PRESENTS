import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import type { RepNotification, RepNotificationType } from "@/types/reps";

/**
 * GET /api/rep-portal/notifications — List notifications for current rep
 *
 * Returns notifications (newest first) with unread_count.
 * Query params: ?limit=20&offset=0
 *
 * Each row carries `actor_photo_url` for peer-action notification types
 * (rep_follow, peer_milestone) so iOS renders the actor's avatar inline
 * instead of falling back to the kind glyph. Defaults to null for system
 * notifications without a clear actor (quest_approved, manual_grant,
 * streak_at_risk, etc.) — iOS falls back to the type's kind glyph.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Fetch notifications and unread count in parallel
    const [notificationsResult, countResult] = await Promise.all([
      supabase
        .from(TABLES.REP_NOTIFICATIONS)
        .select("*")
        .eq("rep_id", repId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),

      supabase
        .from(TABLES.REP_NOTIFICATIONS)
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .eq("org_id", orgId)
        .eq("read", false),
    ]);

    if (notificationsResult.error) {
      return NextResponse.json(
        { error: notificationsResult.error.message },
        { status: 500 }
      );
    }

    const notifications = (notificationsResult.data ?? []) as RepNotification[];

    // Resolve actor avatars for peer-action notifications. Single batch
    // query keyed on the union of actor rep_ids across the page.
    const actorIds = new Set<string>();
    for (const n of notifications) {
      const actorId = actorRepIdForNotification(n);
      if (actorId) actorIds.add(actorId);
    }

    const photoByRepId = new Map<string, string | null>();
    if (actorIds.size > 0) {
      const { data: actors } = await supabase
        .from("reps")
        .select("id, photo_url")
        .in("id", [...actorIds]);
      for (const row of (actors ?? []) as Array<{
        id: string;
        photo_url: string | null;
      }>) {
        photoByRepId.set(row.id, row.photo_url);
      }
    }

    const data = notifications.map((n) => {
      const actorId = actorRepIdForNotification(n);
      const actor_photo_url = actorId ? photoByRepId.get(actorId) ?? null : null;
      return { ...n, actor_photo_url };
    });

    return NextResponse.json({
      data,
      unread_count: countResult.count || 0,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Map a notification to its actor rep_id (the rep who triggered it),
 * if any. System notifications (quest_approved, reward_unlocked,
 * manual_grant, streak_at_risk, ...) have no actor and return null —
 * iOS renders the type glyph in that case.
 *
 * Adding a new peer type? Update this switch + the spec note in
 * `ENTRY-IOS-BACKEND-SPEC.md` §14 (avatar wiring sweep).
 */
function actorRepIdForNotification(n: RepNotification): string | null {
  const meta = (n.metadata ?? null) as Record<string, unknown> | null;
  if (!meta) return null;
  const type = n.type as RepNotificationType;
  switch (type) {
    case "rep_follow":
      return readRepId(meta.follower_rep_id);
    case "peer_milestone":
      // Peer milestone notifications are reserved (the type ships in the
      // RepNotificationType union but no path writes one yet). When the
      // peer-milestone fanout lands, write `metadata.actor_rep_id` and
      // this resolution surfaces immediately.
      return readRepId(meta.actor_rep_id);
    default:
      return null;
  }
}

function readRepId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
