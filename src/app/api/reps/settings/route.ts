import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID, repsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { getRepSettings } from "@/lib/rep-points";
import type { RepProgramSettings } from "@/types/reps";

/**
 * GET /api/reps/settings — Get rep program settings
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const settings = await getRepSettings(ORG_ID);

    return NextResponse.json({ data: settings });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/reps/settings — Save rep program settings
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const settings = body as Partial<RepProgramSettings>;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Request body must be a settings object" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Validate specific fields
    if (settings.default_discount_percent !== undefined && (typeof settings.default_discount_percent !== "number" || settings.default_discount_percent < 0 || settings.default_discount_percent > 100)) {
      return NextResponse.json({ error: "default_discount_percent must be 0-100" }, { status: 400 });
    }
    if (settings.default_discount_type !== undefined && !["percentage", "fixed"].includes(settings.default_discount_type)) {
      return NextResponse.json({ error: "default_discount_type must be 'percentage' or 'fixed'" }, { status: 400 });
    }
    if (settings.email_from_address !== undefined && typeof settings.email_from_address === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email_from_address)) {
      return NextResponse.json({ error: "email_from_address must be a valid email" }, { status: 400 });
    }
    if (settings.email_from_name !== undefined && typeof settings.email_from_name === "string" && settings.email_from_name.length > 100) {
      return NextResponse.json({ error: "email_from_name must be 100 characters or less" }, { status: 400 });
    }

    // Only allow tenant-controlled fields — XP/levels are platform-controlled via /api/platform/xp-config
    const allowedKeys = new Set<string>([
      "enabled", "auto_approve", "default_discount_percent",
      "default_discount_type", "leaderboard_visible",
      "max_events_per_rep", "welcome_message", "email_from_name", "email_from_address",
      "currency_per_sale", "currency_name",
    ]);
    for (const key of Object.keys(settings)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Unknown setting: ${key}` }, { status: 400 });
      }
    }

    // Merge with existing settings to preserve defaults
    const currentSettings = await getRepSettings(ORG_ID);
    const mergedSettings: RepProgramSettings = {
      ...currentSettings,
      ...settings,
    };

    const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: repsKey(ORG_ID),
        data: mergedSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: mergedSettings });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
