import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/rep-notifications";
import * as Sentry from "@sentry/nextjs";

/**
 * POST   /api/rep-portal/reps/:id/follow — start following that rep
 * DELETE /api/rep-portal/reps/:id/follow — stop following that rep
 *
 * Writes/removes a row in rep_follows (follower_id, followee_id). Triggers
 * on that table maintain reps.follower_count / reps.following_count.
 *
 * POST is idempotent — following an already-followed rep is a no-op 200.
 * Self-follow returns 400.
 *
 * On the first follow (no existing row → a new row written), fires a
 * rep_follow notification to the followee.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: targetId } = await params;
    if (!UUID_RE.test(targetId)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }
    if (targetId === auth.rep.id) {
      return NextResponse.json({ error: "You cannot follow yourself" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    // Verify target exists and isn't deleted. 404 for both the missing
    // and the scrubbed case — don't leak which.
    const { data: target } = await db
      .from("reps")
      .select("id, org_id, status, display_name, first_name")
      .eq("id", targetId)
      .maybeSingle();
    if (!target || (target as { status: string }).status === "deleted") {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // Idempotent upsert — duplicate inserts silently succeed.
    const { error, status } = await db
      .from("rep_follows")
      .insert({ follower_id: auth.rep.id, followee_id: targetId })
      .select()
      .maybeSingle();

    const isAlreadyFollowing =
      error != null && (error.code === "23505" || /duplicate key/i.test(error.message ?? ""));

    if (error && !isAlreadyFollowing) {
      Sentry.captureException(error, {
        extra: { followerId: auth.rep.id, followeeId: targetId },
      });
      return NextResponse.json({ error: "Failed to follow" }, { status: 500 });
    }

    // Fire notification only on a freshly-written row. We treat the
    // 201-ish status code from postgrest as the new-row signal.
    if (!isAlreadyFollowing && status !== undefined && status < 300) {
      const followerName =
        auth.rep.email || "A rep";
      createNotification({
        repId: targetId,
        orgId: (target as { org_id: string }).org_id,
        type: "rep_follow",
        title: "New follower",
        body: `${followerName} started following you`,
        link: `/rep/profile/${auth.rep.id}`,
        metadata: { follower_rep_id: auth.rep.id },
      }).catch((err) => {
        Sentry.captureException(err, { level: "warning" });
      });
    }

    // Re-read follower count so iOS can update the profile header without
    // a round-trip to GET /reps/:id.
    const { data: refreshed } = await db
      .from("reps")
      .select("follower_count, following_count")
      .eq("id", targetId)
      .maybeSingle();

    return NextResponse.json({
      data: {
        is_following: true,
        already: isAlreadyFollowing,
        target_follower_count: (refreshed as { follower_count?: number } | null)?.follower_count ?? 0,
        target_following_count: (refreshed as { following_count?: number } | null)?.following_count ?? 0,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reps/[id]/follow] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { id: targetId } = await params;
    if (!UUID_RE.test(targetId)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    // Idempotent — unfollowing a rep you weren't following is a 200.
    const { error } = await db
      .from("rep_follows")
      .delete()
      .eq("follower_id", auth.rep.id)
      .eq("followee_id", targetId);

    if (error) {
      Sentry.captureException(error, {
        extra: { followerId: auth.rep.id, followeeId: targetId },
      });
      return NextResponse.json({ error: "Failed to unfollow" }, { status: 500 });
    }

    const { data: refreshed } = await db
      .from("reps")
      .select("follower_count, following_count")
      .eq("id", targetId)
      .maybeSingle();

    return NextResponse.json({
      data: {
        is_following: false,
        target_follower_count: (refreshed as { follower_count?: number } | null)?.follower_count ?? 0,
        target_following_count: (refreshed as { following_count?: number } | null)?.following_count ?? 0,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reps/[id]/follow] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
