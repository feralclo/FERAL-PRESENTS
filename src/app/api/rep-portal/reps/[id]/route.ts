import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getPlatformXPConfig } from "@/lib/rep-points";
import { getTierName, DEFAULT_TIERS } from "@/lib/xp-levels";
import type { TierDefinition } from "@/lib/xp-levels";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/reps/:id — Rich public profile of another rep
 *
 * Returned to any authenticated rep. All profiles are public in v1 —
 * private profile support (the "return 404 unless mutual" case) is
 * deferred until post-launch.
 *
 * Shape:
 *   {
 *     id, display_name, photo_url, banner_url, level, xp_total, tier,
 *     bio, instagram, tiktok,
 *     follower_count, following_count,
 *     teams: [{ id, handle, display_name, ... }],
 *     recent_quest_completions: [{ quest_title, promoter_name, completed_at, xp_earned }],
 *     is_mutual, is_following, is_followed_by, is_self
 *   }
 *
 * Deleted reps return 404 — their PII was scrubbed and display_name was
 * nulled on soft-delete, so there's nothing public to show.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    // Pull the rep + teams + recent completions + follow edges in parallel
    const [
      repResult,
      membershipsResult,
      recentSubmissionsResult,
      outgoingFollowResult,
      incomingFollowResult,
    ] = await Promise.all([
      db
        .from(TABLES.REPS)
        .select(
          "id, display_name, first_name, last_name, photo_url, banner_url, bio, instagram, tiktok, level, points_balance, follower_count, following_count, status, created_at"
        )
        .eq("id", id)
        .maybeSingle(),
      db
        .from("rep_promoter_memberships")
        .select(
          "promoter_id, status, promoter:promoters(id, handle, display_name, tagline, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, follower_count, team_size)"
        )
        .eq("rep_id", id)
        .eq("status", "approved"),
      // Latest approved quest submissions — the "recent activity" card.
      db
        .from(TABLES.REP_QUEST_SUBMISSIONS)
        .select(
          "id, created_at, reviewed_at, points_awarded, quest:rep_quests(id, title, promoter_id, event_id, xp_reward, points_reward, promoter:promoters(id, handle, display_name))"
        )
        .eq("rep_id", id)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(5),
      // Does the viewer follow this rep?
      db
        .from("rep_follows")
        .select("follower_id")
        .eq("follower_id", auth.rep.id)
        .eq("followee_id", id)
        .maybeSingle(),
      // Does this rep follow the viewer?
      db
        .from("rep_follows")
        .select("follower_id")
        .eq("follower_id", id)
        .eq("followee_id", auth.rep.id)
        .maybeSingle(),
    ]);

    const rep = repResult.data as
      | {
          id: string;
          display_name: string | null;
          first_name: string | null;
          last_name: string | null;
          photo_url: string | null;
          banner_url: string | null;
          bio: string | null;
          instagram: string | null;
          tiktok: string | null;
          level: number | null;
          points_balance: number | null;
          follower_count: number | null;
          following_count: number | null;
          status: string;
          created_at: string;
        }
      | null;

    if (!rep || rep.status === "deleted") {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    const platformConfig = await getPlatformXPConfig();
    const tiers: TierDefinition[] = platformConfig.tiers || DEFAULT_TIERS;

    type Promoter = {
      id: string;
      handle: string;
      display_name: string;
      tagline: string | null;
      accent_hex: number;
      avatar_url: string | null;
      avatar_initials: string | null;
      avatar_bg_hex: number | null;
      cover_image_url: string | null;
      follower_count: number;
      team_size: number;
    };
    type MembershipRow = {
      promoter_id: string;
      status: string;
      promoter: Promoter | Promoter[] | null;
    };

    const teams = ((membershipsResult.data ?? []) as unknown as MembershipRow[])
      .map((m) => (Array.isArray(m.promoter) ? m.promoter[0] ?? null : m.promoter ?? null))
      .filter((p): p is Promoter => !!p)
      .map((p) => ({
        id: p.id,
        handle: p.handle,
        display_name: p.display_name,
        tagline: p.tagline,
        accent_hex: p.accent_hex,
        avatar_url: p.avatar_url,
        avatar_initials: p.avatar_initials,
        avatar_bg_hex: p.avatar_bg_hex,
        cover_image_url: p.cover_image_url,
        follower_count: p.follower_count,
        team_size: p.team_size,
      }));

    type QuestRow = {
      id: string;
      title: string;
      promoter_id: string | null;
      event_id: string | null;
      xp_reward: number | null;
      points_reward: number | null;
      promoter: { id: string; handle: string; display_name: string } | { id: string; handle: string; display_name: string }[] | null;
    };
    type SubmissionRow = {
      id: string;
      created_at: string;
      reviewed_at: string | null;
      points_awarded: number | null;
      quest: QuestRow | QuestRow[] | null;
    };

    const recentQuestCompletions = (
      (recentSubmissionsResult.data ?? []) as unknown as SubmissionRow[]
    )
      .map((s) => {
        const q = Array.isArray(s.quest) ? s.quest[0] ?? null : s.quest;
        if (!q) return null;
        const promoter = q.promoter
          ? Array.isArray(q.promoter)
            ? q.promoter[0] ?? null
            : q.promoter
          : null;
        return {
          submission_id: s.id,
          quest_title: q.title,
          promoter_id: promoter?.id ?? q.promoter_id ?? null,
          promoter_handle: promoter?.handle ?? null,
          promoter_name: promoter?.display_name ?? null,
          completed_at: s.reviewed_at ?? s.created_at,
          xp_earned: s.points_awarded ?? q.xp_reward ?? q.points_reward ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const isFollowing = !!outgoingFollowResult.data;
    const isFollowedBy = !!incomingFollowResult.data;
    const isSelf = id === auth.rep.id;

    return NextResponse.json({
      data: {
        id: rep.id,
        display_name: rep.display_name,
        first_name: rep.first_name,
        last_name: rep.last_name,
        photo_url: rep.photo_url,
        banner_url: rep.banner_url,
        bio: rep.bio,
        instagram: rep.instagram,
        tiktok: rep.tiktok,
        level: rep.level ?? 1,
        xp_total: rep.points_balance ?? 0,
        tier: getTierName(rep.level ?? 1, tiers).toLowerCase(),
        follower_count: rep.follower_count ?? 0,
        following_count: rep.following_count ?? 0,
        teams,
        recent_quest_completions: recentQuestCompletions,
        is_following: isFollowing,
        is_followed_by: isFollowedBy,
        is_mutual: isFollowing && isFollowedBy,
        is_self: isSelf,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reps/[id]] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
