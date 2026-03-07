import { TABLES, ORG_ID, repsKey } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PointsSourceType, RepProgramSettings, PlatformXPConfig } from "@/types/reps";
import { DEFAULT_REP_PROGRAM_SETTINGS, DEFAULT_PLATFORM_XP_CONFIG } from "@/types/reps";
import { levelFromXp, DEFAULT_LEVELING, getTierName, DEFAULT_TIERS, generateThresholds, generateLevelNames } from "@/lib/xp-levels";
import type { LevelingConfig, TierDefinition } from "@/lib/xp-levels";

const PLATFORM_XP_KEY = "entry_platform_xp";

/**
 * Fetch the platform XP config (shared across all orgs).
 * Hydrates backward-compat fields (level_thresholds, level_names) from formula.
 */
export async function getPlatformXPConfig(): Promise<PlatformXPConfig> {
  let config = DEFAULT_PLATFORM_XP_CONFIG;
  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", PLATFORM_XP_KEY)
        .single();

      if (data?.data && typeof data.data === "object") {
        const saved = data.data as Partial<PlatformXPConfig>;
        config = {
          ...DEFAULT_PLATFORM_XP_CONFIG,
          ...saved,
          xp_per_quest_type: {
            ...DEFAULT_PLATFORM_XP_CONFIG.xp_per_quest_type,
            ...(saved.xp_per_quest_type || {}),
          },
          position_xp: {
            ...DEFAULT_PLATFORM_XP_CONFIG.position_xp,
            ...(saved.position_xp || {}),
          },
          leveling: {
            ...DEFAULT_PLATFORM_XP_CONFIG.leveling,
            ...(saved.leveling || {}),
          },
          tiers: saved.tiers || DEFAULT_PLATFORM_XP_CONFIG.tiers,
        };
      }
    }
  } catch {
    // Not found — use defaults
  }

  // Hydrate backward-compat fields from formula
  const leveling: LevelingConfig = config.leveling || DEFAULT_LEVELING;
  const tiers: TierDefinition[] = config.tiers || DEFAULT_TIERS;
  config.level_thresholds = generateThresholds(leveling);
  config.level_names = generateLevelNames(leveling, tiers);

  return config;
}

/**
 * Fetch the rep program settings for an org.
 */
export async function getRepSettings(
  orgId: string = ORG_ID
): Promise<RepProgramSettings> {
  // Dynamic defaults: use org_id as email prefix (e.g., feral@mail.entry.events)
  const orgDefaults = {
    ...DEFAULT_REP_PROGRAM_SETTINGS,
    email_from_address: `${orgId}@mail.entry.events`,
  };

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return orgDefaults;

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", repsKey(orgId))
      .single();

    if (data?.data && typeof data.data === "object") {
      return { ...orgDefaults, ...(data.data as Partial<RepProgramSettings>) };
    }
  } catch {
    // Settings not found — use defaults
  }
  return orgDefaults;
}

/**
 * Calculate level from total XP using the formula-based leveling curve.
 * The `thresholds` parameter is ignored — kept for call-site compat.
 * Uses the platform leveling config directly.
 */
export function calculateLevel(
  pointsBalance: number,
  _thresholds?: number[],
  leveling?: LevelingConfig,
): number {
  return levelFromXp(pointsBalance, leveling || DEFAULT_LEVELING);
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
  currency?: number;
  sourceType: PointsSourceType;
  sourceId?: string;
  description: string;
  createdBy?: string;
}): Promise<{ newBalance: number; newCurrencyBalance: number } | null> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return null;
    const orgId = params.orgId || ORG_ID;
    const currencyAmount = params.currency ?? 0;

    // Get current balances
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("points_balance, currency_balance")
      .eq("id", params.repId)
      .eq("org_id", orgId)
      .single();

    if (!rep) return null;

    const newBalance = rep.points_balance + params.points;
    const newCurrencyBalance = rep.currency_balance + currencyAmount;

    // Insert ledger entry — bail if this fails to prevent balance/ledger drift
    const { error: ledgerError } = await supabase.from(TABLES.REP_POINTS_LOG).insert({
      org_id: orgId,
      rep_id: params.repId,
      points: params.points,
      balance_after: newBalance,
      currency_amount: currencyAmount || 0,
      currency_balance_after: newCurrencyBalance,
      source_type: params.sourceType,
      source_id: params.sourceId || null,
      description: params.description,
      created_by: params.createdBy || null,
    });

    if (ledgerError) {
      console.error("[rep-points] Ledger insert failed:", ledgerError);
      return null;
    }

    // Update denormalized balances + recalculate level using platform config
    const platformConfig = await getPlatformXPConfig();

    // Fetch current level to detect level-up
    const { data: repFull } = await supabase
      .from(TABLES.REPS)
      .select("level")
      .eq("id", params.repId)
      .eq("org_id", orgId)
      .single();
    const oldLevel = repFull?.level || 1;

    const newLevel = calculateLevel(newBalance, undefined, platformConfig.leveling);

    await supabase
      .from(TABLES.REPS)
      .update({
        points_balance: newBalance,
        currency_balance: newCurrencyBalance,
        level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.repId)
      .eq("org_id", orgId);

    // Detect level-up and fire notification + email (fire-and-forget)
    if (newLevel > oldLevel && params.points > 0) {
      const configTiers = (platformConfig.tiers || DEFAULT_TIERS) as TierDefinition[];
      const oldLevelName = getTierName(oldLevel, configTiers);
      const newLevelName = getTierName(newLevel, configTiers);

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

    return { newBalance, newCurrencyBalance };
  } catch (err) {
    console.error("[rep-points] Failed to award points:", err);
    return null;
  }
}

/**
 * Deduct XP from a rep (for refunds/revocations where both XP and currency should decrease).
 * Returns the result or null on failure.
 */
export async function deductPoints(params: {
  repId: string;
  orgId?: string;
  points: number;
  currency?: number;
  sourceType: PointsSourceType;
  sourceId?: string;
  description: string;
  createdBy?: string;
}): Promise<{ newBalance: number; newCurrencyBalance: number } | null> {
  return awardPoints({
    ...params,
    points: -Math.abs(params.points),
    currency: params.currency != null ? -Math.abs(params.currency) : undefined,
  });
}

/**
 * Deduct currency only from a rep (for shop purchases).
 * XP is untouched. Returns the result or null on failure.
 */
export async function deductCurrency(params: {
  repId: string;
  orgId?: string;
  amount: number;
  sourceType: PointsSourceType;
  sourceId?: string;
  description: string;
  createdBy?: string;
}): Promise<{ newBalance: number; newCurrencyBalance: number } | null> {
  return awardPoints({
    ...params,
    points: 0,
    currency: -Math.abs(params.amount),
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
