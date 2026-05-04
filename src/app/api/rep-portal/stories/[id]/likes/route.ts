import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hydrateRepRows, parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/stories/:id/likes — paginated list of every rep
 * who liked the story.
 *
 * Shape matches the followers/following endpoints: { data, total, limit,
 * offset, has_more } so iOS reuses the existing RepListEntry row +
 * Follow button.
 *
 * Visibility: same gate as GET /:id. Followers-only stories require
 * mutual follow. Authors can always read their own.
 *
 * Default page = 25 (iOS pages 25 at a time).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: storyId } = await params;
    if (!UUID_RE.test(storyId)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const me = auth.rep.id;

    // Visibility gate matches the single-story GET.
    const { data: story } = await db
      .from("rep_stories")
      .select("id, author_rep_id, visibility, expires_at, deleted_at")
      .eq("id", storyId)
      .maybeSingle();

    if (!story || (story as { deleted_at: string | null }).deleted_at) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const s = story as {
      id: string;
      author_rep_id: string;
      visibility: string;
      expires_at: string;
      deleted_at: string | null;
    };
    const isAuthor = s.author_rep_id === me;
    if (new Date(s.expires_at).getTime() < Date.now() && !isAuthor) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (s.visibility === "followers" && !isAuthor) {
      const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", me)
          .eq("followee_id", s.author_rep_id)
          .maybeSingle(),
        db
          .from("rep_follows")
          .select("follower_id")
          .eq("follower_id", s.author_rep_id)
          .eq("followee_id", me)
          .maybeSingle(),
      ]);
      if (!iFollow || !followsMe) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
    }

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url, 25, 100);

    const [edgesResult, countResult] = await Promise.all([
      db
        .from("rep_story_likes")
        .select("rep_id, created_at")
        .eq("story_id", storyId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      db
        .from("rep_story_likes")
        .select("rep_id", { count: "exact", head: true })
        .eq("story_id", storyId),
    ]);

    if (edgesResult.error) {
      Sentry.captureException(edgesResult.error, { extra: { repId: me, storyId } });
      return NextResponse.json({ error: "Failed to load likes" }, { status: 500 });
    }

    const ids = ((edgesResult.data ?? []) as Array<{ rep_id: string }>).map((r) => r.rep_id);
    const rows = await hydrateRepRows(db, ids, me);
    const total = countResult.count ?? rows.length;

    return NextResponse.json({
      data: rows,
      total,
      limit,
      offset,
      has_more: offset + rows.length < total,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/stories/[id]/likes] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
