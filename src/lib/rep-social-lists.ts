import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared helpers powering the rep social-graph drill-in endpoints:
 *   /api/rep-portal/me/followers
 *   /api/rep-portal/me/following
 *   /api/rep-portal/me/events
 *   /api/rep-portal/reps/:id/followers
 *   /api/rep-portal/reps/:id/following
 *   /api/rep-portal/reps/:id/events
 *
 * Shape matches the iOS list-row renderer so /me and /reps/:id variants
 * can share a single mapper on the client.
 */

export interface RepListRow {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  /** Wide banner backing the row's card design on iOS. Null = render
   *  the violet accent gradient fallback (graceful — already shipped). */
  banner_url: string | null;
  level: number;
  follower_count: number;
  following_count: number;
  /** Is the requesting rep mutual-following this row's rep? */
  is_mutual: boolean;
  /** Does the requesting rep already follow this row's rep? */
  is_following: boolean;
  created_at: string;
}

export interface EventListRow {
  event_id: string;
  event_name: string;
  event_slug: string;
  date_start: string;
  date_end: string | null;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  cover_image_url: string | null;
  first_seen_at: string;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Bound (limit, offset) into safe numeric ranges. Clamps rather than
 * rejecting so a sloppy client never fails — just gets a sane default.
 */
export function parseListPagination(url: URL, defaultLimit = 50, maxLimit = 100) {
  const rawLimit = parseInt(url.searchParams.get("limit") ?? String(defaultLimit), 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Math.max(1, Math.min(maxLimit, Number.isFinite(rawLimit) ? rawLimit : defaultLimit));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  return { limit, offset };
}

type Db = SupabaseClient;

/**
 * Fetch `repIds` from the reps table in display-safe shape and enrich
 * with the viewer's follow relationship so iOS can render a Follow/
 * Following/Friends button on every row.
 *
 * viewerId === null when the endpoint is called without a requester
 * (shouldn't happen in practice — all these are behind requireRepAuth —
 * but keeps the helper usable for public surfaces later).
 */
export async function hydrateRepRows(
  db: Db,
  repIds: string[],
  viewerId: string | null
): Promise<RepListRow[]> {
  if (repIds.length === 0) return [];

  const [repsResult, viewerOutgoingResult, viewerIncomingResult] = await Promise.all([
    db
      .from("reps")
      .select(
        "id, display_name, first_name, last_name, photo_url, banner_url, level, follower_count, following_count, created_at, status"
      )
      .in("id", repIds),
    viewerId
      ? db.from("rep_follows").select("followee_id").eq("follower_id", viewerId).in("followee_id", repIds)
      : Promise.resolve({ data: [] as Array<{ followee_id: string }> }),
    viewerId
      ? db.from("rep_follows").select("follower_id").eq("followee_id", viewerId).in("follower_id", repIds)
      : Promise.resolve({ data: [] as Array<{ follower_id: string }> }),
  ]);

  const iFollow = new Set(
    ((viewerOutgoingResult as { data: Array<{ followee_id: string }> | null }).data ?? []).map(
      (r) => r.followee_id
    )
  );
  const followsMe = new Set(
    ((viewerIncomingResult as { data: Array<{ follower_id: string }> | null }).data ?? []).map(
      (r) => r.follower_id
    )
  );

  // Preserve the caller's id order (which is the natural order of the
  // page query) — `.in()` doesn't guarantee order.
  const byId = new Map<string, RepListRow>();
  for (const row of (repsResult.data ?? []) as Array<{
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    banner_url: string | null;
    level: number | null;
    follower_count: number | null;
    following_count: number | null;
    created_at: string;
    status: string;
  }>) {
    // Hide deleted reps from lists — their display_name was nulled on
    // soft-delete so they'd render as blank rows anyway.
    if (row.status === "deleted") continue;
    byId.set(row.id, {
      id: row.id,
      display_name: row.display_name,
      first_name: row.first_name,
      last_name: row.last_name,
      photo_url: row.photo_url,
      banner_url: row.banner_url,
      level: row.level ?? 1,
      follower_count: row.follower_count ?? 0,
      following_count: row.following_count ?? 0,
      is_mutual: iFollow.has(row.id) && followsMe.has(row.id),
      is_following: iFollow.has(row.id),
      created_at: row.created_at,
    });
  }

  const out: RepListRow[] = [];
  for (const id of repIds) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}

/**
 * List reps who follow `targetRepId`, paginated, enriched with the viewer's
 * follow state.
 */
export async function listFollowersOf(
  db: Db,
  targetRepId: string,
  viewerId: string | null,
  limit: number,
  offset: number
): Promise<PaginatedEnvelope<RepListRow>> {
  const [edgesResult, countResult] = await Promise.all([
    db
      .from("rep_follows")
      .select("follower_id, created_at")
      .eq("followee_id", targetRepId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db
      .from("rep_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", targetRepId),
  ]);

  const ids = ((edgesResult.data ?? []) as Array<{ follower_id: string }>).map((r) => r.follower_id);
  const rows = await hydrateRepRows(db, ids, viewerId);
  const total = countResult.count ?? rows.length;

  return {
    data: rows,
    total,
    limit,
    offset,
    has_more: offset + rows.length < total,
  };
}

/**
 * List reps whom `sourceRepId` follows, paginated, enriched with the
 * viewer's follow state.
 */
export async function listFollowingOf(
  db: Db,
  sourceRepId: string,
  viewerId: string | null,
  limit: number,
  offset: number
): Promise<PaginatedEnvelope<RepListRow>> {
  const [edgesResult, countResult] = await Promise.all([
    db
      .from("rep_follows")
      .select("followee_id, created_at")
      .eq("follower_id", sourceRepId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db
      .from("rep_follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("follower_id", sourceRepId),
  ]);

  const ids = ((edgesResult.data ?? []) as Array<{ followee_id: string }>).map((r) => r.followee_id);
  const rows = await hydrateRepRows(db, ids, viewerId);
  const total = countResult.count ?? rows.length;

  return {
    data: rows,
    total,
    limit,
    offset,
    has_more: offset + rows.length < total,
  };
}

/**
 * List events a rep has attended (any ticket holder match on their
 * email). Ordered newest-first by first_seen_at.
 */
export async function listAttendedEventsOf(
  db: Db,
  repId: string,
  limit: number,
  offset: number
): Promise<PaginatedEnvelope<EventListRow>> {
  const [attResult, countResult] = await Promise.all([
    db
      .from("rep_event_attendance")
      .select(
        "event_id, first_seen_at, event:events(id, name, slug, date_start, date_end, venue_name, city, country, cover_image, cover_image_url)"
      )
      .eq("rep_id", repId)
      .order("first_seen_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db
      .from("rep_event_attendance")
      .select("event_id", { count: "exact", head: true })
      .eq("rep_id", repId),
  ]);

  type EventRow = {
    id: string;
    name: string;
    slug: string;
    date_start: string;
    date_end: string | null;
    venue_name: string | null;
    city: string | null;
    country: string | null;
    cover_image: string | null;
    cover_image_url: string | null;
  };
  type Row = {
    event_id: string;
    first_seen_at: string;
    event: EventRow | EventRow[] | null;
  };

  const rows = ((attResult.data ?? []) as unknown as Row[])
    .map((r) => {
      const e = Array.isArray(r.event) ? r.event[0] ?? null : r.event;
      if (!e) return null;
      return {
        event_id: e.id,
        event_name: e.name,
        event_slug: e.slug,
        date_start: e.date_start,
        date_end: e.date_end,
        venue_name: e.venue_name,
        city: e.city,
        country: e.country,
        cover_image_url: e.cover_image_url ?? e.cover_image ?? null,
        first_seen_at: r.first_seen_at,
      } satisfies EventListRow;
    })
    .filter((r): r is EventListRow => !!r);

  const total = countResult.count ?? rows.length;
  return {
    data: rows,
    total,
    limit,
    offset,
    has_more: offset + rows.length < total,
  };
}
