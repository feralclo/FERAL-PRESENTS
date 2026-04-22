import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/peer-activity
 *
 * The peer-activity ticker and feed-content source for iOS. Returns
 * recent approved quest submissions from other reps on the same
 * promoter team(s) this rep belongs to, newest first.
 *
 * Query params:
 *   ?limit=50 (1..100)
 *   ?promoter_id=UUID — scope to one promoter instead of all memberships
 *
 * Response:
 *   {
 *     data: [{
 *       id,
 *       rep: { id, display_name, first_name, photo_url, initials, avatar_bg_hex },
 *       verb: 'approved',
 *       quest: { id, title } | null,
 *       event: { id, name } | null,
 *       xp_reward, ep_reward,
 *       created_at
 *     }]
 *   }
 *
 * Privacy: only display_name + photo + first_name are exposed — never
 * email or phone, per the peer-activity spec (§6.7).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 50 : rawLimit));
    const promoterIdFilter = url.searchParams.get("promoter_id");

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Resolve the list of promoter_ids this rep can see activity from
    const { data: memberships } = await db
      .from("rep_promoter_memberships")
      .select("promoter_id, promoter:promoters(org_id)")
      .eq("rep_id", auth.rep.id)
      .eq("status", "approved");

    type Row = { promoter_id: string; promoter: { org_id: string } | { org_id: string }[] | null };
    let approved = ((memberships ?? []) as Row[]).map((m) => ({
      promoter_id: m.promoter_id,
      org_id: Array.isArray(m.promoter) ? m.promoter[0]?.org_id ?? null : m.promoter?.org_id ?? null,
    }));

    if (promoterIdFilter) {
      approved = approved.filter((m) => m.promoter_id === promoterIdFilter);
    }

    const orgIds = approved.map((m) => m.org_id).filter((s): s is string => !!s);
    if (orgIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Pull recent approved submissions across those orgs, joining quest +
    // rep. Exclude the viewer themselves (peer activity = others).
    const { data, error } = await db
      .from("rep_quest_submissions")
      .select(
        "id, rep_id, quest_id, status, created_at, quest:rep_quests(id, title, event_id, points_reward, xp_reward, currency_reward, ep_reward, event:events(id, name))"
      )
      .in("org_id", orgIds)
      .eq("status", "approved")
      .neq("rep_id", auth.rep.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json(
        { error: "Failed to load peer activity" },
        { status: 500 }
      );
    }

    type SubmissionRow = {
      id: string;
      rep_id: string;
      quest_id: string;
      status: string;
      created_at: string;
      quest:
        | {
            id: string;
            title: string;
            event_id: string | null;
            points_reward: number | null;
            xp_reward: number | null;
            currency_reward: number | null;
            ep_reward: number | null;
            event: { id: string; name: string } | { id: string; name: string }[] | null;
          }
        | Array<{
            id: string;
            title: string;
            event_id: string | null;
            points_reward: number | null;
            xp_reward: number | null;
            currency_reward: number | null;
            ep_reward: number | null;
            event: { id: string; name: string } | { id: string; name: string }[] | null;
          }>
        | null;
    };

    const rows = (data ?? []) as unknown as SubmissionRow[];
    const otherRepIds = [...new Set(rows.map((r) => r.rep_id))];

    // Fetch peer rep info in one query — only the display-safe columns.
    const { data: reps } = await db
      .from("reps")
      .select("id, display_name, first_name, last_name, photo_url")
      .in("id", otherRepIds);

    const repById = new Map<
      string,
      {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      }
    >();
    for (const rep of (reps ?? []) as Array<{
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      photo_url: string | null;
    }>) {
      repById.set(rep.id, rep);
    }

    const activity = rows.map((r) => {
      const quest = Array.isArray(r.quest) ? r.quest[0] ?? null : r.quest;
      const event = quest
        ? Array.isArray(quest.event)
          ? quest.event[0] ?? null
          : quest.event
        : null;
      const rep = repById.get(r.rep_id) ?? null;

      const initials = rep
        ? [rep.first_name, rep.last_name]
            .filter(Boolean)
            .map((n) => n!.charAt(0).toUpperCase())
            .join("")
            .slice(0, 2) ||
          (rep.display_name ?? "").charAt(0).toUpperCase()
        : "?";

      return {
        id: r.id,
        rep: rep
          ? {
              id: rep.id,
              display_name: rep.display_name,
              first_name: rep.first_name,
              photo_url: rep.photo_url,
              initials,
              // avatar_bg_hex derived client-side for now — backend colour
              // assignment lands when rep profile gets branding fields.
              avatar_bg_hex: null,
            }
          : null,
        verb: "approved",
        quest: quest ? { id: quest.id, title: quest.title } : null,
        event: event ? { id: event.id, name: event.name } : null,
        xp_reward: quest?.xp_reward ?? quest?.points_reward ?? 0,
        ep_reward: quest?.ep_reward ?? quest?.currency_reward ?? 0,
        created_at: r.created_at,
      };
    });

    return NextResponse.json({ data: activity });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/peer-activity] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
