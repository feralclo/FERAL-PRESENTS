import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/promoters/[handle]
 *
 * Public promoter profile. No auth required. If a Bearer token IS
 * supplied (as a rep), the viewer-specific fields (is_following,
 * is_on_team, membership_status) are populated. Without auth they
 * are returned as null — clients can still render the profile.
 *
 * Response:
 *   {
 *     data: {
 *       id, handle, display_name, tagline, bio, location, accent_hex,
 *       avatar_url, avatar_initials, avatar_bg_hex, cover_image_url,
 *       website, instagram, tiktok, follower_count, team_size,
 *       visibility,
 *       is_following, is_on_team, membership_status,     // null if unauthed
 *       featured_events: EventBrief[],                    // up to 2 upcoming
 *       event_count: int
 *     }
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle: rawHandle } = await params;
    const handle = rawHandle.toLowerCase().replace(/^@/, "");

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // 1. Look up the promoter (case-insensitive on handle)
    const { data: promoter } = await db
      .from("promoters")
      .select(
        "id, org_id, handle, display_name, tagline, bio, location, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, website, instagram, tiktok, follower_count, team_size, visibility"
      )
      .ilike("handle", handle)
      .maybeSingle();

    if (!promoter) {
      return NextResponse.json(
        { error: "Promoter not found" },
        { status: 404 }
      );
    }

    // 2. Optionally resolve a rep from Bearer token — for is_following etc.
    const repId = await tryResolveRepId(request);

    let isFollowing: boolean | null = null;
    let isOnTeam: boolean | null = null;
    let membershipStatus: string | null = null;

    if (repId) {
      const [followResult, membershipResult] = await Promise.all([
        db
          .from("rep_promoter_follows")
          .select("promoter_id")
          .eq("rep_id", repId)
          .eq("promoter_id", promoter.id)
          .maybeSingle(),
        db
          .from("rep_promoter_memberships")
          .select("status")
          .eq("rep_id", repId)
          .eq("promoter_id", promoter.id)
          .maybeSingle(),
      ]);
      isFollowing = !!followResult.data;
      isOnTeam = membershipResult.data?.status === "approved";
      membershipStatus =
        (membershipResult.data?.status as string | undefined) ?? null;
    }

    // 3. Private visibility: only a team member can see the profile
    if (promoter.visibility === "private" && !isOnTeam) {
      return NextResponse.json(
        { error: "Promoter not found" },
        { status: 404 }
      );
    }

    // 4. Fetch featured events (2 nearest upcoming, rep-enabled)
    const { data: featuredRaw } = await db
      .from(TABLES.EVENTS)
      .select(
        "id, name, slug, date_start, date_end, venue_name, city, country, status, cover_image, cover_image_url, poster_image_url, banner_image_url"
      )
      .eq("org_id", promoter.org_id)
      .eq("rep_enabled", true)
      .in("status", ["published", "active", "live"])
      .gte("date_start", new Date().toISOString())
      .order("date_start", { ascending: true })
      .limit(2);

    const { count: totalEventCount } = await db
      .from(TABLES.EVENTS)
      .select("id", { count: "exact", head: true })
      .eq("org_id", promoter.org_id);

    return NextResponse.json({
      data: {
        id: promoter.id,
        handle: promoter.handle,
        display_name: promoter.display_name,
        tagline: promoter.tagline,
        bio: promoter.bio,
        location: promoter.location,
        accent_hex: promoter.accent_hex,
        avatar_url: promoter.avatar_url,
        avatar_initials: promoter.avatar_initials,
        avatar_bg_hex: promoter.avatar_bg_hex,
        cover_image_url: promoter.cover_image_url,
        website: promoter.website,
        instagram: promoter.instagram,
        tiktok: promoter.tiktok,
        follower_count: promoter.follower_count,
        team_size: promoter.team_size,
        visibility: promoter.visibility,
        is_following: isFollowing,
        is_on_team: isOnTeam,
        membership_status: membershipStatus,
        featured_events: (featuredRaw ?? []).map((e) => ({
          id: e.id,
          title: e.name,
          slug: e.slug,
          date_start: e.date_start,
          date_end: e.date_end,
          venue_name: e.venue_name,
          city: e.city,
          country: e.country,
          cover_image_url: e.cover_image_url ?? e.cover_image ?? null,
          poster_image_url: e.poster_image_url ?? null,
          banner_image_url: e.banner_image_url ?? null,
        })),
        event_count: totalEventCount ?? 0,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[promoters/[handle]] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Best-effort optional auth: if the request has a valid Bearer token for
 * an active rep, return that rep's id. Otherwise null. Never throws, never
 * fails the request — this is a public endpoint that merely enhances the
 * response when the caller is logged in.
 */
async function tryResolveRepId(request: NextRequest): Promise<string | null> {
  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data.user) return null;

    const db = await getSupabaseAdmin();
    if (!db) return null;

    const { data: rep } = await db
      .from(TABLES.REPS)
      .select("id, status")
      .eq("auth_user_id", data.user.id)
      .single();

    if (!rep || rep.status !== "active") return null;
    return rep.id as string;
  } catch {
    return null;
  }
}
