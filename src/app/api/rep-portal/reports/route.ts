import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/reports
 *
 * User-safety reporting endpoint required by App Store Guideline 1.2 (UGC
 * apps must expose report controls). iOS surfaces this from the ellipsis
 * menus on RepProfileScreen, PeerActivityCard, and LeaderboardRow.
 *
 * Body: { target_rep_id, reason_code, surface, free_text? }
 *   reason_code: spam | harassment | impersonation | inappropriate_content | other
 *   surface:     profile | peer_activity | leaderboard | message
 *
 * Returns 201 { id, created_at } on success.
 *
 * Self-reports return 400 (defended in DB by a CHECK constraint too).
 * Admin triage UI is a separate PR; this just persists.
 */

const REASON_CODES = [
  "spam",
  "harassment",
  "impersonation",
  "inappropriate_content",
  "other",
] as const;

const SURFACES = [
  "profile",
  "peer_activity",
  "leaderboard",
  "message",
  "story",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// iOS caps the bug-report text field at 1000 chars; server enforces the
// same to keep the contract explicit. DB CHECK is a looser 2000 so this
// can be relaxed client-first without a migration.
const FREE_TEXT_MAX = 1000;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const obj = body as Record<string, unknown>;
    const targetRepId = obj.target_rep_id;
    const targetStoryId = obj.target_story_id;
    const reasonCode = obj.reason_code;
    const surface = obj.surface;
    const freeText = obj.free_text;

    if (typeof targetRepId !== "string" || !UUID_RE.test(targetRepId)) {
      return NextResponse.json(
        { error: "target_rep_id must be a valid UUID" },
        { status: 400 }
      );
    }
    if (typeof reasonCode !== "string" || !REASON_CODES.includes(reasonCode as (typeof REASON_CODES)[number])) {
      return NextResponse.json(
        {
          error: `reason_code must be one of: ${REASON_CODES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    if (typeof surface !== "string" || !SURFACES.includes(surface as (typeof SURFACES)[number])) {
      return NextResponse.json(
        { error: `surface must be one of: ${SURFACES.join(", ")}` },
        { status: 400 }
      );
    }
    // Story reports must identify which story; everything else is rep-
    // identified only. target_story_id is optional and ignored on
    // non-story surfaces (we don't 400 on extra fields).
    let cleanStoryId: string | null = null;
    if (surface === "story") {
      if (typeof targetStoryId !== "string" || !UUID_RE.test(targetStoryId)) {
        return NextResponse.json(
          { error: "target_story_id must be a valid UUID for story reports" },
          { status: 400 }
        );
      }
      cleanStoryId = targetStoryId;
    }
    if (freeText !== undefined && freeText !== null) {
      if (typeof freeText !== "string") {
        return NextResponse.json(
          { error: "free_text must be a string" },
          { status: 400 }
        );
      }
      if (freeText.length > FREE_TEXT_MAX) {
        return NextResponse.json(
          { error: `free_text must be ${FREE_TEXT_MAX} characters or fewer` },
          { status: 400 }
        );
      }
    }

    if (targetRepId === auth.rep.id) {
      return NextResponse.json(
        { error: "cannot_report_self" },
        { status: 400 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Verify target rep exists. Don't leak whether they're deleted/suspended
    // — a generic 404 is enough for the client.
    const { data: target } = await db
      .from("reps")
      .select("id")
      .eq("id", targetRepId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json(
        { error: "Reported rep not found" },
        { status: 404 }
      );
    }

    const cleanFreeText =
      typeof freeText === "string" && freeText.trim() ? freeText.trim() : null;

    const { data, error } = await db
      .from("rep_reports")
      .insert({
        reporter_rep_id: auth.rep.id,
        target_rep_id: targetRepId,
        target_story_id: cleanStoryId,
        reason_code: reasonCode,
        surface,
        free_text: cleanFreeText,
      })
      .select("id, created_at")
      .single();

    if (error) {
      Sentry.captureException(error, {
        extra: { reporterRepId: auth.rep.id, targetRepId, reasonCode, surface },
      });
      return NextResponse.json(
        { error: "Failed to file report" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { id: data.id, created_at: data.created_at },
      { status: 201 }
    );
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reports] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
