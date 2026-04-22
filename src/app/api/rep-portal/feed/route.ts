import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/feed
 *
 * Unified home-screen feed. In v1 this is peer-activity-only — poster
 * drops are paused per the owner's direction (see spec §5.10). Each
 * item uses an iOS-friendly union shape where `kind` discriminates.
 *
 * Query params:
 *   ?limit=50 (1..100)
 *   ?offset=0
 *
 * Response:
 *   {
 *     data: [
 *       { kind: 'peer_activity', id, rep, verb, quest, event,
 *         xp_reward, ep_reward, meta, meta_chip }
 *     ],
 *     pagination: { limit, offset, has_more, total }
 *   }
 *
 * When poster drops come off pause, a second kind 'poster_drop' joins
 * the union and the feed will interleave both sources by created_at.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 50 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Resolve scope from approved memberships
    const { data: memberships } = await db
      .from("rep_promoter_memberships")
      .select("promoter:promoters(org_id)")
      .eq("rep_id", auth.rep.id)
      .eq("status", "approved");

    type MembershipRow = { promoter: { org_id: string } | { org_id: string }[] | null };
    const orgIds = Array.from(
      new Set(
        ((memberships ?? []) as MembershipRow[])
          .map((m) => (Array.isArray(m.promoter) ? m.promoter[0]?.org_id : m.promoter?.org_id))
          .filter((s): s is string => !!s)
      )
    );

    if (orgIds.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: { limit, offset, has_more: false, total: 0 },
      });
    }

    const { data, error, count } = await db
      .from("rep_quest_submissions")
      .select(
        "id, rep_id, quest_id, status, created_at, quest:rep_quests(id, title, points_reward, xp_reward, currency_reward, ep_reward, event:events(id, name))",
        { count: "exact" }
      )
      .in("org_id", orgIds)
      .eq("status", "approved")
      .neq("rep_id", auth.rep.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
    }

    type Row = {
      id: string;
      rep_id: string;
      quest_id: string;
      created_at: string;
      quest:
        | {
            id: string;
            title: string;
            points_reward: number | null;
            xp_reward: number | null;
            currency_reward: number | null;
            ep_reward: number | null;
            event: { id: string; name: string } | { id: string; name: string }[] | null;
          }
        | Array<{
            id: string;
            title: string;
            points_reward: number | null;
            xp_reward: number | null;
            currency_reward: number | null;
            ep_reward: number | null;
            event: { id: string; name: string } | { id: string; name: string }[] | null;
          }>
        | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const otherRepIds = [...new Set(rows.map((r) => r.rep_id))];

    const { data: reps } = await db
      .from("reps")
      .select("id, display_name, first_name, photo_url")
      .in("id", otherRepIds);
    const repById = new Map<
      string,
      { id: string; display_name: string | null; first_name: string | null; photo_url: string | null }
    >();
    for (const rep of (reps ?? []) as Array<{
      id: string;
      display_name: string | null;
      first_name: string | null;
      photo_url: string | null;
    }>) {
      repById.set(rep.id, rep);
    }

    const items = rows.map((r) => {
      const quest = Array.isArray(r.quest) ? r.quest[0] ?? null : r.quest;
      const event = quest
        ? Array.isArray(quest.event)
          ? quest.event[0] ?? null
          : quest.event
        : null;
      const rep = repById.get(r.rep_id) ?? null;

      return {
        kind: "peer_activity" as const,
        id: `peer_${r.id}`,
        rep: rep
          ? {
              id: rep.id,
              display_name: rep.display_name,
              first_name: rep.first_name,
              photo_url: rep.photo_url,
              initials:
                ((rep.first_name ?? "").charAt(0) ||
                  (rep.display_name ?? "").charAt(0) ||
                  "?").toUpperCase(),
            }
          : null,
        verb: "approved",
        quest: quest ? { id: quest.id, title: quest.title } : null,
        event: event ? { id: event.id, name: event.name } : null,
        xp_reward: quest?.xp_reward ?? quest?.points_reward ?? 0,
        ep_reward: quest?.ep_reward ?? quest?.currency_reward ?? 0,
        meta: r.created_at,
        meta_chip: event?.name ?? null,
      };
    });

    const total = count ?? items.length;
    return NextResponse.json({
      data: items,
      pagination: {
        limit,
        offset,
        has_more: offset + items.length < total,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/feed] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
