import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/auth/logout
 *
 * Sign out the current user and clear auth cookies.
 */
export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
