import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
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

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
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
