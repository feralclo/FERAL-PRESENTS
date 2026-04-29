import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

// Always re-evaluate on every request — onboarding state drives the iOS
// welcome strip, and a stale read produces "you've completed this step but
// the strip still shows" complaints. Force the route off Vercel's data
// cache and emit a no-store header so any intermediary caches honour it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/rep-portal/me/onboarding-state
 *
 * Aggregates the rep's first-run progress into one payload so iOS doesn't
 * fan out to /me, /me/memberships, /me/following/promoters, /me/friends,
 * etc. just to pick the right empty state.
 *
 * Booleans, not screens — iOS owns the visual flow. Each boolean answers
 * one onboarding-decision question.
 *
 * Response:
 * {
 *   data: {
 *     has_display_name: bool,
 *     has_photo: bool,
 *     email_verified: bool,
 *     has_approved_membership: bool,    // is on at least one promoter team
 *     has_pending_membership: bool,     // applied but waiting
 *     has_following_promoter: bool,     // follows ≥1 promoter
 *     has_friend: bool,                 // ≥1 mutual rep follow
 *     has_accepted_quest: bool,         // tapped Accept on ≥1 quest
 *     onboarding_completed: bool,       // legacy reps flag (admin-set)
 *     // Composite — true when the rep has the bare minimum to use the app:
 *     // a name, a photo, and is on at least one team. iOS uses this to
 *     // decide whether to gate the main feed behind the onboarding wizard.
 *     ready_for_main_app: bool,
 *     // ISO8601 timestamp the response was computed. Lets iOS surface
 *     // staleness in dev mode and lets us debug "the strip still says
 *     // missing X" by hitting the endpoint and confirming a fresh eval.
 *     last_evaluated_at: string,
 *   }
 * }
 *
 * All counts use head-only queries to avoid pulling row data — cheap.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    // requireRepAuth() returns only {id, auth_user_id, email, org_id, status}
    // so the profile fields used below have to come from a fresh fetch.
    // rep_follows columns: follower_id / followee_id (not the
    // *_rep_id aliases used in some sibling tables — match the existing
    // leaderboard usage).
    // Note: `email_verified` lives on auth.users (email_confirmed_at), not
    // reps — selecting it on reps used to silently null the whole row.
    const [
      repRes,
      authUserRes,
      approvedMembershipsRes,
      pendingMembershipsRes,
      followingPromotersRes,
      acceptancesRes,
      followingRepsRes,
      followersRes,
    ] = await Promise.all([
      db
        .from("reps")
        .select("display_name, photo_url, onboarding_completed")
        .eq("id", repId)
        .maybeSingle(),
      db.auth.admin.getUserById(auth.rep.auth_user_id),
      db
        .from("rep_promoter_memberships")
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .eq("status", "approved"),
      db
        .from("rep_promoter_memberships")
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .eq("status", "pending"),
      db
        .from("rep_promoter_follows")
        .select("rep_id", { count: "exact", head: true })
        .eq("rep_id", repId),
      db
        .from("rep_quest_acceptances")
        .select("quest_id", { count: "exact", head: true })
        .eq("rep_id", repId),
      // For "has_friend" — we need mutual follow. Pull the (small) lists
      // and compute the intersection in JS rather than try to express
      // mutuality in a single PostgREST query. Capped at 200 each;
      // beyond that the rep is well past onboarding anyway.
      db
        .from("rep_follows")
        .select("followee_id")
        .eq("follower_id", repId)
        .limit(200),
      db
        .from("rep_follows")
        .select("follower_id")
        .eq("followee_id", repId)
        .limit(200),
    ]);

    type RepRow = {
      display_name: string | null;
      photo_url: string | null;
      onboarding_completed: boolean | null;
    };
    const repRow = (repRes.data ?? null) as RepRow | null;
    const hasDisplayName = !!repRow?.display_name?.trim();
    const hasPhoto = !!repRow?.photo_url?.trim();
    const emailVerified = !!authUserRes.data?.user?.email_confirmed_at;
    const onboardingCompleted = !!repRow?.onboarding_completed;

    const approvedCount = approvedMembershipsRes.count ?? 0;
    const pendingCount = pendingMembershipsRes.count ?? 0;
    const followingPromotersCount = followingPromotersRes.count ?? 0;
    const acceptedQuestsCount = acceptancesRes.count ?? 0;

    // Mutual follow = friend.
    const followingIds = new Set(
      (followingRepsRes.data ?? []).map(
        (r) => (r as { followee_id: string }).followee_id,
      ),
    );
    const hasFriend = (followersRes.data ?? []).some((r) =>
      followingIds.has((r as { follower_id: string }).follower_id),
    );

    const hasApprovedMembership = approvedCount > 0;
    const readyForMainApp =
      hasDisplayName && hasPhoto && hasApprovedMembership;

    return NextResponse.json(
      {
        data: {
          has_display_name: hasDisplayName,
          has_photo: hasPhoto,
          email_verified: emailVerified,
          has_approved_membership: hasApprovedMembership,
          has_pending_membership: pendingCount > 0,
          has_following_promoter: followingPromotersCount > 0,
          has_friend: hasFriend,
          has_accepted_quest: acceptedQuestsCount > 0,
          onboarding_completed: onboardingCompleted,
          ready_for_main_app: readyForMainApp,
          last_evaluated_at: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/onboarding-state] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
