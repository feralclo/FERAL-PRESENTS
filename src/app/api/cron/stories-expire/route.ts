import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * Stories expiry cron — runs hourly (see vercel.json).
 *
 * Soft-deletes stories whose expires_at has passed. The feed and /:id
 * endpoints already filter expired rows out, so this is strictly
 * housekeeping: keeps the active-story indexes small and prevents
 * authors from undeleting past-expiry content via edge-case paths.
 *
 * Auth: CRON_SECRET header (Vercel-triggered).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from("rep_stories")
      .update({ deleted_at: nowIso })
      .lt("expires_at", nowIso)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      expired: (data ?? []).length,
      ran_at: nowIso,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
