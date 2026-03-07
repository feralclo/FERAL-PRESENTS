import { NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getRepSettings, getPlatformXPConfig } from "@/lib/rep-points";
import { generateLevelTable } from "@/lib/xp-levels";
import type { LevelingConfig, TierDefinition } from "@/lib/xp-levels";
import { DEFAULT_LEVELING, DEFAULT_TIERS } from "@/lib/xp-levels";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/settings — Public-facing rep program settings (protected)
 *
 * Returns currency_name, XP economy info, tiers, and level table
 * for rep-facing pages to display the leveling system.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();

    const [settings, platformConfig, domainResult] = await Promise.all([
      getRepSettings(orgId),
      getPlatformXPConfig(),
      supabase
        ? supabase
            .from(TABLES.DOMAINS)
            .select("hostname")
            .eq("org_id", orgId)
            .eq("is_primary", true)
            .eq("status", "active")
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const leveling: LevelingConfig = platformConfig.leveling || DEFAULT_LEVELING;
    const tiers: TierDefinition[] = (platformConfig.tiers || DEFAULT_TIERS) as TierDefinition[];

    // Generate a compact level table (first 20 levels for display)
    const fullTable = generateLevelTable(leveling, tiers);
    const levelTable = fullTable.slice(0, 20).map((row) => ({
      level: row.level,
      totalXp: row.totalXp,
      xpToNext: row.xpToNext,
      tier: row.tierName,
      color: row.tierColor,
    }));

    return NextResponse.json({
      data: {
        currency_name: settings.currency_name,
        currency_per_sale: settings.currency_per_sale,
        points_per_sale: platformConfig.xp_per_sale,
        xp_per_quest_type: platformConfig.xp_per_quest_type,
        tiers,
        level_table: levelTable,
        max_level: leveling.max_level,
        public_url: domainResult.data?.hostname
          ? `https://${domainResult.data.hostname}`
          : null,
        // Backward compat
        level_names: platformConfig.level_names,
        level_thresholds: platformConfig.level_thresholds,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/settings] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
