import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/activity
 *
 * Personal activity feed for the Profile screen — completions, claims,
 * level-ups, manual grants. Aggregated from rep_points_log (which
 * captures every XP/EP movement) plus rejected/revision-requested
 * quest submissions (those don't write to the log because no points
 * change hands).
 *
 * Query: ?limit=25 (1..100)  ?offset=0
 *
 * Response row shape:
 *   {
 *     id: string,
 *     kind: 'quest_approved' | 'quest_rejected' | 'quest_revision' |
 *           'reward_claim' | 'reward_refund' | 'manual_grant' |
 *           'level_up' | 'other',
 *     title: string,                // human-readable headline
 *     subtitle: string | null,      // context (rejection reason, etc.)
 *     xp_delta: int,                // signed; positive = gained
 *     ep_delta: int,                // signed; positive = gained
 *     created_at: string (ISO),
 *     deep_link: string | null      // e.g. "/quests/{id}", "/rewards/{id}"
 *   }
 *
 * Sort: newest first.
 *
 * Two-source merge approach: pull (limit + offset + buffer) from each
 * source then sort+slice client-side. Buffer accounts for the merge —
 * grabbing exactly `limit` rows from each could leave gaps. For typical
 * activity volumes this is fine; revisit if a rep crosses 1k events.
 */

const REWARD_DEEP_LINK_PREFIX = "/rewards";
const QUEST_DEEP_LINK_PREFIX = "/quests";

interface ActivityRow {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  xp_delta: number;
  ep_delta: number;
  created_at: string;
  deep_link: string | null;
}

interface PointsLogRow {
  id: string;
  points: number | null;
  currency_amount: number | null;
  source_type: string | null;
  source_id: string | null;
  description: string | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  quest_id: string;
  status: string;
  rejection_reason: string | null;
  requires_revision: boolean;
  created_at: string;
  reviewed_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const { searchParams } = request.nextUrl;
    const rawLimit = parseInt(searchParams.get("limit") ?? "25", 10);
    const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 25 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    // Pull-with-buffer so the post-merge slice still has `limit` rows
    // even when one source dominates. 50 is plenty for v1 activity
    // volumes (a busy rep does maybe 5 things a day).
    const fetchSize = limit + offset + 50;

    const [pointsRes, submissionsRes] = await Promise.all([
      db
        .from(TABLES.REP_POINTS_LOG)
        .select(
          "id, points, currency_amount, source_type, source_id, description, created_at",
        )
        .eq("rep_id", repId)
        .order("created_at", { ascending: false })
        .limit(fetchSize),
      // Only "negative" submission outcomes go in here — approvals
      // already create a points_log row via awardPoints, so surfacing
      // them again would double-count.
      db
        .from(TABLES.REP_QUEST_SUBMISSIONS)
        .select(
          "id, quest_id, status, rejection_reason, requires_revision, created_at, reviewed_at",
        )
        .eq("rep_id", repId)
        .in("status", ["rejected", "requires_revision"])
        .order("created_at", { ascending: false })
        .limit(fetchSize),
    ]);

    const pointsRows = (pointsRes.data ?? []) as PointsLogRow[];
    const submissionRows = (submissionsRes.data ?? []) as SubmissionRow[];

    // Resolve titles in batch — quest_id from points_log entries with
    // source_type='quest_submission'/'quest_approved' AND from the
    // rejected submissions; reward_id from claims. Skipped if there are
    // no IDs to fetch.
    const questIds = new Set<string>();
    const rewardIds = new Set<string>();
    for (const r of pointsRows) {
      if (
        (r.source_type === "quest_approved" ||
          r.source_type === "quest_submission") &&
        r.source_id
      ) {
        questIds.add(r.source_id);
      }
      if (
        (r.source_type === "reward_claim" ||
          r.source_type === "reward_refund") &&
        r.source_id
      ) {
        rewardIds.add(r.source_id);
      }
    }
    for (const s of submissionRows) {
      questIds.add(s.quest_id);
    }

    const [questsRes, rewardsRes] = await Promise.all([
      questIds.size > 0
        ? db
            .from(TABLES.REP_QUESTS)
            .select("id, title")
            .in("id", Array.from(questIds))
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
      rewardIds.size > 0
        ? db
            .from(TABLES.REP_REWARDS)
            .select("id, title")
            .in("id", Array.from(rewardIds))
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    ]);

    const questTitleById = new Map<string, string>();
    for (const q of (questsRes.data ?? []) as Array<{
      id: string;
      title: string;
    }>) {
      questTitleById.set(q.id, q.title);
    }
    const rewardTitleById = new Map<string, string>();
    for (const r of (rewardsRes.data ?? []) as Array<{
      id: string;
      title: string;
    }>) {
      rewardTitleById.set(r.id, r.title);
    }

    // Map each source into the unified ActivityRow shape. iOS then sorts
    // and renders — but we sort here too so the cap is correct.
    const fromPoints: ActivityRow[] = pointsRows.map((r) => {
      const sourceType = r.source_type ?? "other";
      const xp = r.points ?? 0;
      const ep = r.currency_amount ?? 0;

      let kind: string;
      let title: string;
      let deepLink: string | null = null;

      switch (sourceType) {
        case "quest_approved":
        case "quest_submission":
          kind = "quest_approved";
          title = r.source_id
            ? questTitleById.get(r.source_id) ?? "Quest approved"
            : "Quest approved";
          deepLink = r.source_id ? `${QUEST_DEEP_LINK_PREFIX}/${r.source_id}` : null;
          break;
        case "reward_claim":
          kind = "reward_claim";
          title = r.source_id
            ? rewardTitleById.get(r.source_id) ?? "Reward claimed"
            : "Reward claimed";
          deepLink = r.source_id
            ? `${REWARD_DEEP_LINK_PREFIX}/${r.source_id}`
            : null;
          break;
        case "reward_refund":
          kind = "reward_refund";
          title = r.source_id
            ? `Refund: ${rewardTitleById.get(r.source_id) ?? "Reward"}`
            : "Reward refunded";
          deepLink = r.source_id
            ? `${REWARD_DEEP_LINK_PREFIX}/${r.source_id}`
            : null;
          break;
        case "manual_grant":
        case "manual":
          kind = "manual_grant";
          title = r.description || "Bonus from your team";
          break;
        case "level_up":
          kind = "level_up";
          title = r.description || "Levelled up";
          break;
        default:
          kind = "other";
          title = r.description || "Activity";
      }

      return {
        id: r.id,
        kind,
        title,
        subtitle: r.description && r.description !== title ? r.description : null,
        xp_delta: xp,
        ep_delta: ep,
        created_at: r.created_at,
        deep_link: deepLink,
      };
    });

    const fromSubmissions: ActivityRow[] = submissionRows.map((s) => {
      const isRevision = s.requires_revision || s.status === "requires_revision";
      const questTitle = questTitleById.get(s.quest_id) ?? "Your quest";
      return {
        id: s.id,
        kind: isRevision ? "quest_revision" : "quest_rejected",
        title: isRevision
          ? `Revision requested: ${questTitle}`
          : `Rejected: ${questTitle}`,
        subtitle: s.rejection_reason,
        xp_delta: 0,
        ep_delta: 0,
        created_at: s.reviewed_at ?? s.created_at,
        deep_link: `${QUEST_DEEP_LINK_PREFIX}/${s.quest_id}`,
      };
    });

    const merged = [...fromPoints, ...fromSubmissions].sort((a, b) => {
      // ISO timestamps sort lexicographically.
      if (a.created_at < b.created_at) return 1;
      if (a.created_at > b.created_at) return -1;
      return 0;
    });

    const sliced = merged.slice(offset, offset + limit);

    return NextResponse.json({
      data: sliced,
      pagination: {
        limit,
        offset,
        has_more: merged.length > offset + limit,
        // total here is the merged-buffer total, not the true row count.
        // Kept for shape parity with /feed; iOS shouldn't trust it as a
        // grand total beyond pagination decisions.
        total: merged.length,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/activity] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
