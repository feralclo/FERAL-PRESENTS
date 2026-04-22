import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getPlatformXPConfig } from "@/lib/rep-points";
import {
  getLevelProgress,
  getTierName,
  DEFAULT_LEVELING,
  DEFAULT_TIERS,
} from "@/lib/xp-levels";
import type { LevelingConfig, TierDefinition } from "@/lib/xp-levels";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/balances
 *
 * Light-weight polling endpoint: current XP + EP + level info + lifetime
 * stats. Used by iOS Dynamic Island / Live Activity / quick home-screen
 * refresh without paying the cost of the full dashboard.
 *
 * Response:
 *   {
 *     data: {
 *       xp: {
 *         balance: int, level: int, tier: string, tier_next: string|null,
 *         from_last_level: int, for_next_level: int|null,
 *         xp_to_next_level: int
 *       },
 *       ep: { balance: int, label: string },
 *       lifetime: {
 *         total_sales: int,
 *         total_revenue_pence: int,
 *         approved_quests: int
 *       }
 *     }
 *   }
 */
export async function GET() {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const [repResult, platformConfig, approvedQuestsResult] = await Promise.all([
      db
        .from(TABLES.REPS)
        .select("points_balance, currency_balance, total_sales, total_revenue")
        .eq("id", auth.rep.id)
        .single(),
      getPlatformXPConfig(),
      db
        .from(TABLES.REP_QUEST_SUBMISSIONS)
        .select("id", { count: "exact", head: true })
        .eq("rep_id", auth.rep.id)
        .eq("status", "approved"),
    ]);

    const rep = (repResult.data ?? null) as {
      points_balance: number | null;
      currency_balance: number | null;
      total_sales: number | null;
      total_revenue: number | null;
    } | null;

    if (!rep) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    const leveling: LevelingConfig =
      (platformConfig.leveling as LevelingConfig | undefined) ||
      DEFAULT_LEVELING;
    const tiers: TierDefinition[] =
      (platformConfig.tiers as TierDefinition[] | undefined) || DEFAULT_TIERS;

    const progress = getLevelProgress(rep.points_balance ?? 0, leveling);
    const tier = getTierName(progress.level, tiers);
    const tierNext = getTierName(progress.level + 1, tiers);
    const atMax = progress.nextLevelXp === null;

    return NextResponse.json({
      data: {
        xp: {
          balance: rep.points_balance ?? 0,
          level: progress.level,
          tier,
          tier_next: tierNext !== tier ? tierNext : null,
          from_last_level: progress.currentLevelXp,
          for_next_level: progress.nextLevelXp,
          xp_to_next_level: atMax
            ? 0
            : Math.max(
                0,
                (progress.nextLevelXp as number) - (rep.points_balance ?? 0)
              ),
        },
        ep: {
          balance: rep.currency_balance ?? 0,
          label: `${rep.currency_balance ?? 0} EP`,
        },
        lifetime: {
          total_sales: rep.total_sales ?? 0,
          total_revenue_pence: Math.round(Number(rep.total_revenue ?? 0) * 100),
          approved_quests: approvedQuestsResult.count ?? 0,
        },
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/balances] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
