import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth, requirePlatformOwner } from "@/lib/auth";
import { getPlatformXPConfig } from "@/lib/rep-points";
import type { PlatformXPConfig } from "@/types/reps";
import * as Sentry from "@sentry/nextjs";

const PLATFORM_XP_KEY = "entry_platform_xp";

/**
 * GET /api/platform/xp-config — Get platform XP config (any authenticated admin)
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const config = await getPlatformXPConfig();
    return NextResponse.json({ data: config });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/platform/xp-config — Save platform XP config (platform owner only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const body = await request.json();
    const config = body as Partial<PlatformXPConfig>;

    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { error: "Request body must be a config object" },
        { status: 400 }
      );
    }

    // Validate XP fields
    if (config.xp_per_sale !== undefined && (typeof config.xp_per_sale !== "number" || config.xp_per_sale < 0)) {
      return NextResponse.json({ error: "xp_per_sale must be a non-negative number" }, { status: 400 });
    }
    if (config.xp_per_quest_type !== undefined && typeof config.xp_per_quest_type !== "object") {
      return NextResponse.json({ error: "xp_per_quest_type must be an object" }, { status: 400 });
    }
    if (config.position_xp !== undefined && typeof config.position_xp !== "object") {
      return NextResponse.json({ error: "position_xp must be an object" }, { status: 400 });
    }

    // Validate leveling
    if (config.leveling !== undefined) {
      if (typeof config.leveling !== "object") {
        return NextResponse.json({ error: "leveling must be an object" }, { status: 400 });
      }
      const { base_xp, exponent, max_level } = config.leveling;
      if (base_xp !== undefined && (typeof base_xp !== "number" || base_xp < 1)) {
        return NextResponse.json({ error: "leveling.base_xp must be >= 1" }, { status: 400 });
      }
      if (exponent !== undefined && (typeof exponent !== "number" || exponent < 1 || exponent > 3)) {
        return NextResponse.json({ error: "leveling.exponent must be between 1 and 3" }, { status: 400 });
      }
      if (max_level !== undefined && (typeof max_level !== "number" || max_level < 5 || max_level > 100)) {
        return NextResponse.json({ error: "leveling.max_level must be between 5 and 100" }, { status: 400 });
      }
    }

    // Validate tiers
    if (config.tiers !== undefined) {
      if (!Array.isArray(config.tiers) || config.tiers.length < 1) {
        return NextResponse.json({ error: "tiers must be a non-empty array" }, { status: 400 });
      }
      for (const t of config.tiers) {
        if (!t.name || typeof t.min_level !== "number" || !t.color) {
          return NextResponse.json({ error: "Each tier needs name, min_level, and color" }, { status: 400 });
        }
      }
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Merge with existing config
    const currentConfig = await getPlatformXPConfig();
    const mergedConfig: PlatformXPConfig = {
      ...currentConfig,
      ...config,
      xp_per_quest_type: {
        ...currentConfig.xp_per_quest_type,
        ...(config.xp_per_quest_type || {}),
      },
      position_xp: {
        ...currentConfig.position_xp,
        ...(config.position_xp || {}),
      },
      leveling: {
        ...currentConfig.leveling,
        ...(config.leveling || {}),
      },
      tiers: config.tiers || currentConfig.tiers,
      // Don't persist deprecated fields — they're generated at runtime
      level_thresholds: [],
      level_names: [],
    };

    const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: PLATFORM_XP_KEY,
        data: mergedConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: mergedConfig });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
