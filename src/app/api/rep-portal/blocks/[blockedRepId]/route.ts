import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/rep-portal/blocks/[blockedRepId] — unblock a rep.
 *
 * Path param is the BLOCKED rep's UUID (not the block-row id) because iOS
 * already knows the rep ID it wants to unblock from the GET /blocks
 * response or the rep's profile screen — saves it from tracking the
 * separate block-row id.
 *
 * Idempotent: deleting a non-existent block returns 200, not 404. Lets
 * iOS fire-and-forget on the "Unblock" tap without first checking state.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ blockedRepId: string }> },
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { blockedRepId } = await params;
    if (!blockedRepId || !UUID_RE.test(blockedRepId)) {
      return NextResponse.json(
        { error: "blockedRepId must be a valid UUID" },
        { status: 400 },
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    const { error } = await db
      .from("rep_blocks")
      .delete()
      .eq("blocker_rep_id", auth.rep.id)
      .eq("blocked_rep_id", blockedRepId);

    if (error) {
      Sentry.captureException(error, {
        extra: { repId: auth.rep.id, blockedRepId },
      });
      return NextResponse.json(
        { error: "Failed to unblock rep" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: { unblocked: true } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/blocks/[id]] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
