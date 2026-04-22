import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/promoters/[handle]/follow
 *
 * Idempotent. Creates a rep_promoter_follows row if one doesn't exist.
 * Trigger on the table bumps promoters.follower_count by 1.
 *
 * Response: { data: { is_following: true, promoter_id: string } }
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  return withHandle(params, async (repId, promoter) => {
    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { error } = await db
      .from("rep_promoter_follows")
      .upsert(
        { rep_id: repId, promoter_id: promoter.id },
        { onConflict: "rep_id,promoter_id", ignoreDuplicates: true }
      );

    if (error) {
      Sentry.captureException(error, {
        extra: { repId, promoterId: promoter.id },
      });
      return NextResponse.json(
        { error: "Failed to follow promoter" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { is_following: true, promoter_id: promoter.id },
    });
  });
}

/**
 * DELETE /api/rep-portal/promoters/[handle]/follow
 *
 * Idempotent. Removes the follow row if present. Trigger decrements
 * promoters.follower_count. No-op if not following.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  return withHandle(params, async (repId, promoter) => {
    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { error } = await db
      .from("rep_promoter_follows")
      .delete()
      .eq("rep_id", repId)
      .eq("promoter_id", promoter.id);

    if (error) {
      Sentry.captureException(error, {
        extra: { repId, promoterId: promoter.id },
      });
      return NextResponse.json(
        { error: "Failed to unfollow promoter" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { is_following: false, promoter_id: promoter.id },
    });
  });
}

// ---------------------------------------------------------------------------
// Shared handle-resolver guard
// ---------------------------------------------------------------------------

async function withHandle(
  params: Promise<{ handle: string }>,
  fn: (
    repId: string,
    promoter: { id: string; visibility: string }
  ) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { handle: rawHandle } = await params;
    const handle = rawHandle.toLowerCase().replace(/^@/, "");

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: promoter } = await db
      .from("promoters")
      .select("id, visibility")
      .ilike("handle", handle)
      .maybeSingle();

    if (!promoter) {
      return NextResponse.json(
        { error: "Promoter not found" },
        { status: 404 }
      );
    }

    return fn(auth.rep.id, promoter as { id: string; visibility: string });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/promoters/[handle]/follow] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
