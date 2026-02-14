import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/rep-portal/logout — Sign out (public)
 *
 * Clears the Supabase Auth session.
 */
export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error("[rep-portal/logout] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
