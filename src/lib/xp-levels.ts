/**
 * XP & Leveling system for the Entry platform.
 *
 * XP is platform-wide (set by Entry, not tenants).
 * Leveling uses a polynomial curve: xp_to_next = floor(base * level^exponent)
 *
 * The formula determines how much XP is needed to advance from each level:
 *   Level 1→2: base * 1^exp = base XP
 *   Level 2→3: base * 2^exp XP
 *   Level N→N+1: base * N^exp XP
 *
 * Cumulative XP for level N = sum(base * i^exp) for i = 1 to N-1
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LevelingConfig {
  base_xp: number;
  exponent: number;
  max_level: number;
}

export interface TierDefinition {
  name: string;
  min_level: number;
  color: string;
}

export const DEFAULT_LEVELING: LevelingConfig = {
  base_xp: 100,
  exponent: 1.5,
  max_level: 50,
};

export const DEFAULT_TIERS: TierDefinition[] = [
  { name: "Rookie", min_level: 1, color: "#94A3B8" },
  { name: "Rising", min_level: 5, color: "#38BDF8" },
  { name: "Pro", min_level: 10, color: "#34D399" },
  { name: "Veteran", min_level: 15, color: "#8B5CF6" },
  { name: "Elite", min_level: 20, color: "#F59E0B" },
  { name: "Legend", min_level: 30, color: "#F43F5E" },
  { name: "Mythic", min_level: 40, color: "#FFD700" },
];

// ─── Level Calculations ─────────────────────────────────────────────────────

/**
 * XP required to go from level `level` to `level + 1`.
 */
export function xpForNextLevel(level: number, config: LevelingConfig = DEFAULT_LEVELING): number {
  if (level < 1 || level >= config.max_level) return Infinity;
  return Math.floor(config.base_xp * Math.pow(level, config.exponent));
}

/**
 * Total (cumulative) XP required to reach `level`. Level 1 = 0 XP.
 */
export function totalXpForLevel(level: number, config: LevelingConfig = DEFAULT_LEVELING): number {
  if (level <= 1) return 0;
  const cap = Math.min(level, config.max_level + 1);
  let total = 0;
  for (let i = 1; i < cap; i++) {
    total += Math.floor(config.base_xp * Math.pow(i, config.exponent));
  }
  return total;
}

/**
 * Calculate level from total XP.
 */
export function levelFromXp(xp: number, config: LevelingConfig = DEFAULT_LEVELING): number {
  let level = 1;
  let cumulative = 0;
  while (level < config.max_level) {
    const needed = Math.floor(config.base_xp * Math.pow(level, config.exponent));
    if (cumulative + needed > xp) break;
    cumulative += needed;
    level++;
  }
  return level;
}

/**
 * Detailed level progress for UI display.
 */
export function getLevelProgress(xp: number, config: LevelingConfig = DEFAULT_LEVELING) {
  const level = levelFromXp(xp, config);
  const currentLevelXp = totalXpForLevel(level, config);
  const atMax = level >= config.max_level;
  const nextLevelXp = atMax ? null : totalXpForLevel(level + 1, config);
  const xpIntoLevel = xp - currentLevelXp;
  const xpNeeded = nextLevelXp !== null ? nextLevelXp - currentLevelXp : null;

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpNeeded,
    progress: xpNeeded ? Math.min(1, xpIntoLevel / xpNeeded) : 1,
  };
}

// ─── Tier Lookup ────────────────────────────────────────────────────────────

/**
 * Get the tier for a given level. Returns the highest tier whose min_level <= level.
 */
export function getTierForLevel(level: number, tiers: TierDefinition[] = DEFAULT_TIERS): TierDefinition {
  let result = tiers[0] || DEFAULT_TIERS[0];
  for (const tier of tiers) {
    if (level >= tier.min_level) {
      result = tier;
    }
  }
  return result;
}

/**
 * Get the tier name for a level.
 */
export function getTierName(level: number, tiers: TierDefinition[] = DEFAULT_TIERS): string {
  return getTierForLevel(level, tiers).name;
}

// ─── Level Table (for preview/admin) ────────────────────────────────────────

export interface LevelTableRow {
  level: number;
  totalXp: number;
  xpToNext: number;
  tierName: string;
  tierColor: string;
}

export function generateLevelTable(
  config: LevelingConfig = DEFAULT_LEVELING,
  tiers: TierDefinition[] = DEFAULT_TIERS,
): LevelTableRow[] {
  const table: LevelTableRow[] = [];
  for (let i = 1; i <= config.max_level; i++) {
    const tier = getTierForLevel(i, tiers);
    table.push({
      level: i,
      totalXp: totalXpForLevel(i, config),
      xpToNext: i < config.max_level ? xpForNextLevel(i, config) : 0,
      tierName: tier.name,
      tierColor: tier.color,
    });
  }
  return table;
}

// ─── Backward Compatibility ─────────────────────────────────────────────────

/**
 * Generate a level_thresholds array from the formula (for code that still expects it).
 * Returns cumulative XP thresholds for levels 2..max_level.
 */
export function generateThresholds(config: LevelingConfig = DEFAULT_LEVELING): number[] {
  const thresholds: number[] = [];
  for (let i = 2; i <= config.max_level; i++) {
    thresholds.push(totalXpForLevel(i, config));
  }
  return thresholds;
}

/**
 * Generate level names from tier definitions.
 * Returns an array where index i = name for level i+1.
 */
export function generateLevelNames(
  config: LevelingConfig = DEFAULT_LEVELING,
  tiers: TierDefinition[] = DEFAULT_TIERS,
): string[] {
  const names: string[] = [];
  for (let i = 1; i <= config.max_level; i++) {
    const tier = getTierForLevel(i, tiers);
    names.push(tier.name);
  }
  return names;
}
