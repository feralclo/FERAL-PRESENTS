import { NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getRepSettings, getPlatformXPConfig } from "@/lib/rep-points";
import { ORG_ID } from "@/lib/constants";

/**
 * GET /api/rep-portal/settings — Public-facing rep program settings (protected)
 *
 * Returns currency_name, level_names, and other display-relevant settings
 * that rep-facing pages need without fetching the full program config.
 * Level names/thresholds come from platform config (not tenant settings).
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const [settings, platformConfig] = await Promise.all([
      getRepSettings(ORG_ID),
      getPlatformXPConfig(),
    ]);

    return NextResponse.json({
      data: {
        currency_name: settings.currency_name,
        currency_per_sale: settings.currency_per_sale,
        points_per_sale: platformConfig.xp_per_sale,
        level_names: platformConfig.level_names,
        level_thresholds: platformConfig.level_thresholds,
      },
    });
  } catch (err) {
    console.error("[rep-portal/settings] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
