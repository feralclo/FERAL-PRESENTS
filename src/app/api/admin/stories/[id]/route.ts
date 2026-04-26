import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/admin/stories/[id] — tenant-admin moderation removal.
 *
 * Admins can remove any story authored by a rep on their team. Soft-
 * delete (sets deleted_at + moderation metadata); the row stays so
 * the original report can still reference it for audit.
 *
 * Authorisation:
 *   - requireAuth() — admin Bearer/cookie auth
 *   - The story's author must have an approved membership with this
 *     tenant's promoter, OR the rep's legacy org_id must match. Reps
 *     on a different tenant's team can't be moderated through this
 *     endpoint.
 *
 * Body (optional): { reason?: string } — admin's reason for removal,
 * persisted onto the story for the audit trail.
 *
 * Pairs with App Store Guideline 1.2 — UGC apps need a takedown
 * mechanism beyond "let the author delete their own posts".
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user, orgId } = auth;

    const { id: storyId } = await params;
    if (!storyId || !UUID_RE.test(storyId)) {
      return NextResponse.json(
        { error: "Story id must be a valid UUID" },
        { status: 400 },
      );
    }

    let reason: string | null = null;
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (typeof body?.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim().slice(0, 500);
      }
    } catch {
      // Body is optional — ignore parse failures.
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    // Load story + author so we can verify the admin has authority
    // over the author's tenant. Reads happen even if already soft-
    // deleted so a re-delete returns 200 with the existing state.
    const { data: story } = await db
      .from("rep_stories")
      .select("id, author_rep_id, deleted_at")
      .eq("id", storyId)
      .maybeSingle();

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Authority check: author either has an approved membership with
    // this tenant's promoter, OR matches the legacy reps.org_id field.
    // Both checked; either passes.
    const [authorRes, promoterRes] = await Promise.all([
      db
        .from("reps")
        .select("id, org_id")
        .eq("id", story.author_rep_id)
        .maybeSingle(),
      db
        .from("promoters")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle(),
    ]);

    if (!authorRes.data) {
      return NextResponse.json(
        { error: "Story author not found" },
        { status: 404 },
      );
    }

    let authorised = authorRes.data.org_id === orgId;
    if (!authorised && promoterRes.data?.id) {
      const { data: membership } = await db
        .from("rep_promoter_memberships")
        .select("id")
        .eq("rep_id", story.author_rep_id)
        .eq("promoter_id", promoterRes.data.id)
        .eq("status", "approved")
        .maybeSingle();
      authorised = !!membership;
    }

    if (!authorised) {
      return NextResponse.json(
        { error: "Cannot moderate stories from outside your team" },
        { status: 403 },
      );
    }

    // Idempotent: re-deleting an already-removed story is a no-op
    // success. Saves iOS from racing the read.
    if (story.deleted_at) {
      return NextResponse.json({
        data: { removed: true, already_removed: true },
      });
    }

    const { error: updateError } = await db
      .from("rep_stories")
      .update({
        deleted_at: new Date().toISOString(),
        moderation_removed_by: user.id,
        moderation_reason: reason,
      })
      .eq("id", storyId);

    if (updateError) {
      Sentry.captureException(updateError, {
        extra: { storyId, orgId, userId: user.id },
      });
      return NextResponse.json(
        { error: "Failed to remove story" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: { removed: true, already_removed: false },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/stories/[id]] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
