/**
 * Smart-mix algorithm — turns the trending track pool into a personalized
 * ranked feed for one rep. Pure function, no IO. The orchestrator
 * (suggestions.ts) loads the pool + the rep's affinity + impression rows
 * and hands them in.
 *
 * Design rationale (full context in conversation 2026-05-04):
 *   - Spotify killed /recommendations + /audio-features for new apps in
 *     late 2024, so we can't lean on Spotify's ML. Co-occurrence math +
 *     curator signal does the work instead.
 *   - Curators front-load their favorites → position weight.
 *   - A track in multiple curated playlists is a stronger signal than a
 *     track in one → cross-playlist boost.
 *   - Spotify's `popularity` (0–100) filters out genuinely-dead tracks
 *     without excluding underground gems (we keep anything ≥15).
 *   - "Fresh" (added in last 14d to a playlist) gets a multiplier so the
 *     feed feels alive when curators drop new material.
 *   - Per-rep impressions decay weight, eventually filtering out tracks
 *     they've been shown without picking.
 *   - Affinity (rep skews schranz) shifts the playlist-distribution of
 *     the output; cold-start (no affinity yet) does even stratified
 *     sampling across playlists.
 */

import type { SpotifyTrack } from "@/lib/spotify/client";

// ─── Tunables ──────────────────────────────────────────────────────────────
// Surfaced as named constants so the values are auditable without grep.

/** Tracks below this Spotify popularity score are dropped from the pool. */
export const POPULARITY_FLOOR = 15;
/** Tracks added in the last N days get the recency multiplier. */
export const FRESH_WINDOW_DAYS = 14;
/** Tracks added in the last N days are flagged `is_fresh` for UI hint. */
export const VERY_FRESH_WINDOW_DAYS = 7;
/** Recency boost multiplier (multiplied with base score). */
export const RECENCY_BOOST = 1.4;
/** Boost added for each additional playlist a track appears in. */
export const COOCCURRENCE_BOOST_PER_EXTRA = 0.35;
/** Position bands → score addition. Curators front-load favorites. */
const POSITION_BANDS: { maxPos: number; bonus: number }[] = [
  { maxPos: 9, bonus: 0.25 },
  { maxPos: 29, bonus: 0.1 },
  { maxPos: Infinity, bonus: 0 },
];
/** Half-life for time-decay on per-rep impressions. An impression from
 *  N days ago effectively counts as 2^(-N/HALF_LIFE) — after ~7 days,
 *  one-time impressions are nearly forgotten and a "skipped" track can
 *  re-enter the rep's rotation organically. */
export const IMPRESSION_HALF_LIFE_DAYS = 7;
/** Floor on the impression multiplier — heavily-shown tracks are heavily
 *  deprioritized but NEVER filtered out entirely. A rep might not be in
 *  the mood for a track today but want to see it next week; permanent
 *  hiding is the wrong default. Combined with affinity / cross-playlist
 *  boost / recency, an under-loved banger can still surface. */
const IMPRESSION_MULTIPLIER_FLOOR = 0.2;

// ─── Inputs / outputs ──────────────────────────────────────────────────────

export interface PoolTrack {
  playlist_id: string;
  track_id: string;
  added_at_spotify: string; // ISO
  first_seen_at: string; // ISO
  popularity: number;
  position: number;
  track_data: SpotifyTrack;
}

export interface RepImpression {
  track_id: string;
  count: number;
  last_shown_at: string;
}

/** Map of playlist_id → weight summing to 1. Empty = cold-start. */
export type AffinityWeights = Record<string, number>;

export interface RankedTrack {
  track: SpotifyTrack;
  source_playlist_id: string;
  is_fresh: boolean;
  score: number;
  /** How many configured playlists this track appears in. */
  playlist_count: number;
}

export interface MixOptions {
  /** Output cap. */
  limit?: number;
  /** Reference time — defaults to now. Injected for deterministic tests. */
  now?: Date;
}

// ─── Algorithm ─────────────────────────────────────────────────────────────

interface ScoredEntry extends PoolTrack {
  score: number;
  playlist_count: number;
  is_fresh: boolean;
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function positionBonus(position: number): number {
  for (const band of POSITION_BANDS) {
    if (position <= band.maxPos) return band.bonus;
  }
  return 0;
}

/**
 * Time-decayed effective impression count. A raw count of 5 from yesterday
 * is much "heavier" than the same 5 from a month ago.
 */
function effectiveImpressionCount(
  rawCount: number,
  lastShownAt: string | undefined,
  now: Date
): number {
  if (rawCount <= 0) return 0;
  if (!lastShownAt) return rawCount;
  const lastShown = new Date(lastShownAt);
  if (Number.isNaN(lastShown.getTime())) return rawCount;
  const daysAgo = Math.max(
    0,
    (now.getTime() - lastShown.getTime()) / 86_400_000
  );
  const decayFactor = Math.pow(0.5, daysAgo / IMPRESSION_HALF_LIFE_DAYS);
  return rawCount * decayFactor;
}

/**
 * Smooth multiplier that approaches the floor as effective impressions grow.
 *   count = 0 → 1.0   (no damping)
 *   count = 1 → 0.7
 *   count = 2 → 0.49
 *   count = 5 → 0.27
 *   count >> → 0.2    (floor; never lower)
 *
 * Asymptotic decay is intentional. A track shown 50 times still gets the
 * floor — never zero — so the rep can re-discover it after their taste
 * shifts or after the time decay heals the historical count.
 */
function impressionMultiplier(effectiveCount: number): number {
  if (effectiveCount <= 0) return 1.0;
  return (
    IMPRESSION_MULTIPLIER_FLOOR +
    (1 - IMPRESSION_MULTIPLIER_FLOOR) * Math.exp(-effectiveCount * 0.5)
  );
}

/**
 * Score a single pool entry. Returns the raw score before affinity is
 * applied (orchestrator multiplies in affinity per-playlist after dedup).
 */
function scoreEntry(
  entry: PoolTrack,
  impression: { count: number; last_shown_at?: string } | undefined,
  now: Date
): { score: number; is_fresh: boolean } | null {
  if (entry.popularity < POPULARITY_FLOOR) return null;

  const effectiveImpressions = impression
    ? effectiveImpressionCount(impression.count, impression.last_shown_at, now)
    : 0;
  const impMult = impressionMultiplier(effectiveImpressions);

  const addedAt = new Date(entry.added_at_spotify);
  const ageDays = dayDiff(now, addedAt);
  const isFresh = ageDays <= VERY_FRESH_WINDOW_DAYS;
  const recencyMult = ageDays <= FRESH_WINDOW_DAYS ? RECENCY_BOOST : 1.0;

  // Base components — additive.
  const popularityComponent = (entry.popularity / 100) * 0.3;
  const positionComponent = positionBonus(entry.position);
  const base = 1.0 + popularityComponent + positionComponent;

  return {
    score: base * recencyMult * impMult,
    is_fresh: isFresh,
  };
}

/**
 * Dedupe by track_id — when a track lives in multiple playlists, pick the
 * single playlist source with the highest score and add cross-playlist
 * boost based on how many playlists it appeared in. The kept entry's
 * `source_playlist_id` is the best-scoring one (curator who positioned it
 * highest wins the attribution).
 */
function dedupeAndBoost(
  entries: ScoredEntry[]
): ScoredEntry[] {
  const byTrack = new Map<string, ScoredEntry[]>();
  for (const e of entries) {
    const arr = byTrack.get(e.track_id);
    if (arr) arr.push(e);
    else byTrack.set(e.track_id, [e]);
  }
  const out: ScoredEntry[] = [];
  for (const variants of byTrack.values()) {
    variants.sort((a, b) => b.score - a.score);
    const winner = variants[0];
    const playlistCount = variants.length;
    const cooccurrenceBoost =
      (playlistCount - 1) * COOCCURRENCE_BOOST_PER_EXTRA;
    // Boost is added to the score; it's NOT multiplied so a single very
    // strong signal can still beat a weak track that happens to be in two
    // playlists.
    out.push({
      ...winner,
      score: winner.score + cooccurrenceBoost,
      playlist_count: playlistCount,
    });
  }
  return out;
}

/**
 * Apply per-playlist affinity weights. Cold-start (empty affinity) →
 * uniform 1/N across the playlists actually represented in the pool, so
 * stratified sampling falls out for free.
 */
function applyAffinity(
  entries: ScoredEntry[],
  affinity: AffinityWeights
): ScoredEntry[] {
  const playlistsPresent = new Set(entries.map((e) => e.playlist_id));
  const useUniform =
    Object.keys(affinity).length === 0 ||
    Object.values(affinity).every((v) => v === 0);

  let weights: AffinityWeights;
  if (useUniform) {
    const w = 1 / Math.max(1, playlistsPresent.size);
    weights = {};
    for (const id of playlistsPresent) weights[id] = w;
  } else {
    // Normalize given affinity to sum to 1 across playlists actually
    // present in the pool — drops weight for playlists that returned no
    // tracks (e.g. an empty fresh-only window).
    const total = Array.from(playlistsPresent).reduce(
      (sum, id) => sum + (affinity[id] ?? 0),
      0
    );
    if (total === 0) {
      const w = 1 / Math.max(1, playlistsPresent.size);
      weights = {};
      for (const id of playlistsPresent) weights[id] = w;
    } else {
      weights = {};
      for (const id of playlistsPresent) weights[id] = (affinity[id] ?? 0) / total;
    }
  }

  // Multiply score by N × playlist-weight (N = playlist count) so the
  // baseline (uniform across N playlists) doesn't shrink scores —
  // affinity becomes a tilt rather than a divide.
  const n = playlistsPresent.size;
  return entries.map((e) => ({
    ...e,
    score: e.score * (weights[e.playlist_id] ?? 0) * n,
  }));
}

/**
 * Walk the ranked list and reorder so the same primary artist never
 * appears back-to-back. If we hit a duplicate, swap the next non-matching
 * track up. Falls back to the natural order if nothing else is available.
 */
function diversifyByArtist(entries: ScoredEntry[]): ScoredEntry[] {
  const out: ScoredEntry[] = [];
  const remaining = [...entries];
  let lastArtistId: string | null = null;

  while (remaining.length > 0) {
    let pickIdx = remaining.findIndex(
      (e) => (e.track_data.artists[0]?.id ?? null) !== lastArtistId
    );
    if (pickIdx === -1) pickIdx = 0; // nothing else available
    const picked = remaining.splice(pickIdx, 1)[0];
    out.push(picked);
    lastArtistId = picked.track_data.artists[0]?.id ?? null;
  }
  return out;
}

/**
 * Stratified picker — given the desired weights per playlist and a
 * scored+deduped+sorted-within-playlist pool, walks playlists in
 * round-robin order taking the next-best entry from each until `limit`
 * is hit, biased by the weights.
 *
 * Why this matters: pure score sort can collapse to one playlist if its
 * tracks happen to score uniformly higher (e.g. fresher curator activity
 * recently). Stratification guarantees variety even when scores cluster.
 */
function stratifiedPick(
  entries: ScoredEntry[],
  affinity: AffinityWeights,
  limit: number
): ScoredEntry[] {
  // Bucket by playlist, sorted within each by score.
  const buckets = new Map<string, ScoredEntry[]>();
  for (const e of entries) {
    const arr = buckets.get(e.playlist_id);
    if (arr) arr.push(e);
    else buckets.set(e.playlist_id, [e]);
  }
  for (const arr of buckets.values()) arr.sort((a, b) => b.score - a.score);

  // Compute target picks per playlist from the (possibly empty) affinity.
  const playlistIds = Array.from(buckets.keys());
  const useUniform =
    Object.keys(affinity).length === 0 ||
    Object.values(affinity).every((v) => v === 0);

  const targets = new Map<string, number>();
  if (useUniform) {
    const each = limit / playlistIds.length;
    for (const id of playlistIds) targets.set(id, each);
  } else {
    const total = playlistIds.reduce(
      (sum, id) => sum + (affinity[id] ?? 0),
      0
    );
    if (total === 0) {
      const each = limit / playlistIds.length;
      for (const id of playlistIds) targets.set(id, each);
    } else {
      for (const id of playlistIds) {
        targets.set(id, ((affinity[id] ?? 0) / total) * limit);
      }
    }
  }

  // Round-robin pick, weighted: each round, pick from playlists that
  // still owe their target. Ordered by remaining-owed descending so the
  // playlist farthest from its target picks first — keeps the mix close
  // to weights even when a playlist's bucket is small.
  const taken = new Map<string, number>();
  for (const id of playlistIds) taken.set(id, 0);
  const out: ScoredEntry[] = [];

  while (out.length < limit) {
    let progressed = false;
    const ranking = playlistIds
      .map((id) => ({
        id,
        owed: (targets.get(id) ?? 0) - (taken.get(id) ?? 0),
      }))
      .sort((a, b) => b.owed - a.owed);

    for (const { id, owed } of ranking) {
      if (owed <= 0) continue;
      const bucket = buckets.get(id);
      if (!bucket || bucket.length === 0) continue;
      const next = bucket.shift()!;
      out.push(next);
      taken.set(id, (taken.get(id) ?? 0) + 1);
      progressed = true;
      if (out.length >= limit) break;
    }

    if (!progressed) {
      // No playlist had an owed quota AND content. Fall through to
      // best-of-remaining to fill the limit.
      const remaining: ScoredEntry[] = [];
      for (const arr of buckets.values()) remaining.push(...arr);
      remaining.sort((a, b) => b.score - a.score);
      for (const e of remaining) {
        out.push(e);
        if (out.length >= limit) break;
      }
      break;
    }
  }

  return out;
}

/**
 * Main entry point. Pool comes from `trending_track_pool`, impressions
 * from `rep_track_impressions`, affinity from suggestions.ts (which
 * derives it from the rep's recent picks).
 */
export function smartMix(
  pool: PoolTrack[],
  affinity: AffinityWeights,
  impressions: RepImpression[],
  options: MixOptions = {}
): RankedTrack[] {
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const now = options.now ?? new Date();

  const impressionByTrack = new Map<string, RepImpression>();
  for (const imp of impressions) {
    impressionByTrack.set(imp.track_id, imp);
  }

  // 1. Score each entry, drop sub-floor.
  const scored: ScoredEntry[] = [];
  for (const entry of pool) {
    const impression = impressionByTrack.get(entry.track_id);
    const result = scoreEntry(entry, impression, now);
    if (!result) continue;
    scored.push({
      ...entry,
      score: result.score,
      is_fresh: result.is_fresh,
      playlist_count: 1, // updated by dedupeAndBoost
    });
  }

  // 2. Dedupe by track_id, applying cross-playlist boost.
  const deduped = dedupeAndBoost(scored);
  if (deduped.length === 0) return [];

  // 3. Apply affinity (or uniform if cold-start).
  const weighted = applyAffinity(deduped, affinity);

  // 4. Stratified pick — guarantees playlist variety even when scores cluster.
  const picked = stratifiedPick(weighted, affinity, limit);

  // 5. Artist diversity pass — no two same-artist back-to-back.
  const diversified = diversifyByArtist(picked);

  return diversified.map((e) => ({
    track: e.track_data,
    source_playlist_id: e.playlist_id,
    is_fresh: e.is_fresh,
    score: e.score,
    playlist_count: e.playlist_count,
  }));
}

// ─── Affinity helper ───────────────────────────────────────────────────────

/**
 * Build affinity weights from a rep's track-pick history + the current
 * pool. For each pick, we count which playlist(s) currently host that
 * track and divide the vote across them. Result sums to 1 (or is empty
 * when the rep has fewer than the cold-start threshold of picks).
 *
 * Threshold is intentional: with <5 picks the signal is noise, and we
 * want stratified sampling to expose the rep to variety.
 */
export const COLD_START_THRESHOLD = 5;

export function deriveAffinity(
  pickedTrackIds: string[],
  pool: PoolTrack[]
): AffinityWeights {
  if (pickedTrackIds.length < COLD_START_THRESHOLD) return {};

  // Build track_id → set<playlist_id> from the current pool.
  const byTrack = new Map<string, Set<string>>();
  for (const entry of pool) {
    const set = byTrack.get(entry.track_id);
    if (set) set.add(entry.playlist_id);
    else byTrack.set(entry.track_id, new Set([entry.playlist_id]));
  }

  const tally: Record<string, number> = {};
  let totalVotes = 0;
  for (const trackId of pickedTrackIds) {
    const playlists = byTrack.get(trackId);
    if (!playlists || playlists.size === 0) continue;
    const voteWeight = 1 / playlists.size;
    for (const id of playlists) {
      tally[id] = (tally[id] ?? 0) + voteWeight;
      totalVotes += voteWeight;
    }
  }

  if (totalVotes === 0) return {};

  const weights: AffinityWeights = {};
  for (const [id, votes] of Object.entries(tally)) {
    weights[id] = votes / totalVotes;
  }
  return weights;
}
