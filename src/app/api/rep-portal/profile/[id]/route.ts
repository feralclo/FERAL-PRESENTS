import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getRepSettings } from "@/lib/rep-points";

/**
 * GET /api/rep-portal/profile/[id] — Public rep profile (protected)
 *
 * Returns public-facing profile data for any active rep.
 * Accessible by any authenticated rep (for viewing other reps' profiles).
 * Does NOT expose email, phone, date_of_birth, or gender.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Rep ID required" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const [repResult, settingsResult] = await Promise.all([
      supabase
        .from(TABLES.REPS)
        .select(
          "id, display_name, first_name, photo_url, instagram, tiktok, bio, level, points_balance, total_sales, total_revenue, created_at"
        )
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .eq("status", "active")
        .single(),
      getRepSettings(ORG_ID),
    ]);

    if (repResult.error || !repResult.data) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    const rep = repResult.data;
    const settings = settingsResult;

    // Calculate level name
    const levelIndex = rep.level - 1;
    const levelName =
      settings.level_names[levelIndex] || `Level ${rep.level}`;

    // Calculate leaderboard position
    let leaderboardPosition: number | null = null;
    const { data: allReps } = await supabase
      .from(TABLES.REPS)
      .select("id, total_revenue")
      .eq("org_id", ORG_ID)
      .eq("status", "active")
      .order("total_revenue", { ascending: false });

    if (allReps) {
      const idx = allReps.findIndex(
        (r: { id: string }) => r.id === id
      );
      leaderboardPosition = idx >= 0 ? idx + 1 : null;
    }

    // Return public profile — no email, phone, DOB, or gender
    return NextResponse.json({
      data: {
        id: rep.id,
        display_name: rep.display_name || rep.first_name,
        photo_url: rep.photo_url,
        instagram: rep.instagram,
        tiktok: rep.tiktok,
        bio: rep.bio,
        level: rep.level,
        level_name: levelName,
        total_sales: rep.total_sales,
        total_revenue: rep.total_revenue,
        leaderboard_position: leaderboardPosition,
        joined_at: rep.created_at,
        is_self: rep.id === auth.rep.id,
      },
    });
  } catch (err) {
    console.error("[rep-portal/profile] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
