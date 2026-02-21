import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { getPlatformXPConfig } from "@/lib/rep-points";
import type { PlatformXPConfig } from "@/types/reps";

const PLATFORM_XP_KEY = "entry_platform_xp";

/**
 * GET /api/platform/xp-config — Get platform XP config (admin auth required)
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const config = await getPlatformXPConfig();
    return NextResponse.json({ data: config });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/platform/xp-config — Save platform XP config (admin auth required)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const config = body as Partial<PlatformXPConfig>;

    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { error: "Request body must be a config object" },
        { status: 400 }
      );
    }

    // Validate fields
    if (config.xp_per_sale !== undefined && (typeof config.xp_per_sale !== "number" || config.xp_per_sale < 0)) {
      return NextResponse.json({ error: "xp_per_sale must be a non-negative number" }, { status: 400 });
    }
    if (config.xp_per_quest_type !== undefined && typeof config.xp_per_quest_type !== "object") {
      return NextResponse.json({ error: "xp_per_quest_type must be an object" }, { status: 400 });
    }
    if (config.position_xp !== undefined && typeof config.position_xp !== "object") {
      return NextResponse.json({ error: "position_xp must be an object" }, { status: 400 });
    }
    if (config.level_thresholds !== undefined && (!Array.isArray(config.level_thresholds) || config.level_thresholds.some((t: unknown) => typeof t !== "number" || (t as number) < 0))) {
      return NextResponse.json({ error: "level_thresholds must be an array of non-negative numbers" }, { status: 400 });
    }
    if (config.level_names !== undefined && (!Array.isArray(config.level_names) || config.level_names.some((n: unknown) => typeof n !== "string"))) {
      return NextResponse.json({ error: "level_names must be an array of strings" }, { status: 400 });
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
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
