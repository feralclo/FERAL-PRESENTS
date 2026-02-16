import { TABLES, ORG_ID, repsKey } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PointsSourceType, RepProgramSettings } from "@/types/reps";
import { DEFAULT_REP_PROGRAM_SETTINGS } from "@/types/reps";

/**
 * Fetch the rep program settings for an org.
 */
export async function getRepSettings(
  orgId: string = ORG_ID
): Promise<RepProgramSettings> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return DEFAULT_REP_PROGRAM_SETTINGS;

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", repsKey(orgId))
      .single();

    if (data?.data && typeof data.data === "object") {
      return { ...DEFAULT_REP_PROGRAM_SETTINGS, ...(data.data as Partial<RepProgramSettings>) };
    }
  } catch {
    // Settings not found — use defaults
  }
  return DEFAULT_REP_PROGRAM_SETTINGS;
}

/**
 * Calculate level from total points earned (lifetime, not current balance).
 * Uses the thresholds from program settings.
 */
export function calculateLevel(
  pointsBalance: number,
  thresholds: number[] = DEFAULT_REP_PROGRAM_SETTINGS.level_thresholds
): number {
  let level = 1;
  for (const threshold of thresholds) {
    if (pointsBalance >= threshold) {
      level++;
    } else {
      break;
    }
  }
  return Math.min(level, thresholds.length + 1);
}

/**
 * Award points to a rep. Appends to the ledger and updates denormalized balance + level.
 *
 * Returns the new balance or null on failure. Never throws.
 */
export async function awardPoints(params: {
  repId: string;
  orgId?: string;
  points: number;
  sourceType: PointsSourceType;
  sourceId?: string;
  description: string;
  createdBy?: string;
}): Promise<number | null> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return null;
    const orgId = params.orgId || ORG_ID;

    // Get current balance
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("points_balance")
      .eq("id", params.repId)
      .eq("org_id", orgId)
      .single();

    if (!rep) return null;

    const newBalance = rep.points_balance + params.points;

    // Insert ledger entry — bail if this fails to prevent balance/ledger drift
    const { error: ledgerError } = await supabase.from(TABLES.REP_POINTS_LOG).insert({
      org_id: orgId,
      rep_id: params.repId,
      points: params.points,
      balance_after: newBalance,
      source_type: params.sourceType,
      source_id: params.sourceId || null,
      description: params.description,
      created_by: params.createdBy || null,
    });

    if (ledgerError) {
      console.error("[rep-points] Ledger insert failed:", ledgerError);
      return null;
    }

    // Update denormalized balance + recalculate level
    const settings = await getRepSettings(orgId);

    // Fetch current level to detect level-up
    const { data: repFull } = await supabase
      .from(TABLES.REPS)
      .select("level")
      .eq("id", params.repId)
      .eq("org_id", orgId)
      .single();
    const oldLevel = repFull?.level || 1;

    const newLevel = calculateLevel(newBalance, settings.level_thresholds);

    await supabase
      .from(TABLES.REPS)
      .update({
        points_balance: newBalance,
        level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.repId)
      .eq("org_id", orgId);

    // Detect level-up and fire notification + email (fire-and-forget)
    if (newLevel > oldLevel && params.points > 0) {
      const oldLevelName = settings.level_names[oldLevel - 1] || `Level ${oldLevel}`;
      const newLevelName = settings.level_names[newLevel - 1] || `Level ${newLevel}`;

      import("@/lib/rep-notifications").then(({ createNotification }) => {
        createNotification({
          repId: params.repId,
          orgId,
          type: "level_up",
          title: "Level Up!",
          body: `You're now Level ${newLevel} — ${newLevelName}`,
          link: "/rep",
          metadata: { old_level: oldLevel, new_level: newLevel },
        }).catch(() => {});
      }).catch(() => {});

      import("@/lib/rep-emails").then(({ sendRepEmail }) => {
        sendRepEmail({
          type: "level_up",
          repId: params.repId,
          orgId,
          data: {
            old_level: oldLevel,
            old_level_name: oldLevelName,
            new_level: newLevel,
            new_level_name: newLevelName,
          },
        }).catch(() => {});
      }).catch(() => {});
    }

    return newBalance;
  } catch (err) {
    console.error("[rep-points] Failed to award points:", err);
    return null;
  }
}

/**
 * Deduct points from a rep (for reward claims or revocations).
 * Returns the new balance or null on failure.
 */
export async function deductPoints(params: {
  repId: string;
  orgId?: string;
  points: number;
  sourceType: PointsSourceType;
  sourceId?: string;
  description: string;
  createdBy?: string;
}): Promise<number | null> {
  return awardPoints({
    ...params,
    points: -Math.abs(params.points),
  });
}

/**
 * Get the points history for a rep.
 */
export async function getPointsHistory(
  repId: string,
  orgId: string = ORG_ID,
  limit: number = 50,
  offset: number = 0
) {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return [];

    const { data } = await supabase
      .from(TABLES.REP_POINTS_LOG)
      .select("*")
      .eq("rep_id", repId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return data || [];
  } catch {
    return [];
  }
}
