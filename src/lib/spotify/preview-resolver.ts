/**
 * Server-side preview URL resolver.
 *
 * Spotify's preview_url has been ~50% populated since their 2024 catalog
 * change, so iOS built a three-source fallback chain (Spotify → iTunes
 * → Deezer) client-side in build 13. Consolidating it here means:
 *   - one cache across all clients (rep picks same track on iPhone + web
 *     + Android → one fetch, not three)
 *   - we can add sources (YouTube, SoundCloud, label-direct) later
 *     without shipping a new app build
 *   - deterministic ISRC matching against Apple Music when Spotify
 *     exposes it (avoids fuzzy name matches for remixes / live versions)
 *
 * No credentials needed — iTunes Search and Deezer's public search API
 * are anonymous + rate-generous. Spotify lookup still uses the existing
 * client-credentials token.
 *
 * 2026-05-04 — wrong-song bug fix:
 *   The fuzzy iTunes / Deezer paths previously took the first hit with
 *   a preview URL, no matter who the artist was. For niche techno track
 *   names ("Underground", "Hard Truths", etc) this returned a
 *   completely different song with the same title. Every non-ISRC path
 *   now requires the matched record's artist to align with the
 *   requested artist. ISRC matches stay deterministic — the code is
 *   literally a unique-recording identifier.
 *
 *   Response now carries matched_name + matched_artist so iOS can
 *   silently sanity-check or display what's actually playing.
 */

import * as Sentry from "@sentry/nextjs";
import { getTrack, isConfigured as spotifyIsConfigured } from "./client";

export type PreviewSource = "spotify" | "itunes" | "deezer";

export interface ResolvedPreview {
  url: string;
  source: PreviewSource;
  /** Duration of the preview audio in ms, when the source reports it. */
  duration_ms: number | null;
  /** Any transform notes for observability (strict match, fuzzy match, etc.) */
  match_note?: string;
  /** Track name reported by the matching source. Lets iOS verify the
   *  resolved preview actually belongs to the requested track. Absent on
   *  Spotify hits — those are by track_id so verification is implicit. */
  matched_name?: string;
  /** Primary artist reported by the matching source. Same purpose as
   *  matched_name. */
  matched_artist?: string;
}

export interface ResolveArgs {
  /** Spotify track id — when given, we try Spotify's own preview_url first. */
  track_id?: string | null;
  /** Required for iTunes / Deezer fallbacks. */
  name?: string | null;
  /** Primary artist name; additional artists go in `artists`. */
  artist?: string | null;
  /** Alternative to (artist). When non-empty, first element wins as "artist". */
  artists?: string[] | null;
  /** International Standard Recording Code — enables deterministic Apple Music match. */
  isrc?: string | null;
}

// ─── Per-process cache ─────────────────────────────────────────────────────
// Keyed by a normalised signature covering every field that affects the
// result. Cached null results too — if a track genuinely has no preview,
// repeated lookups would burn quota for nothing. Short negative TTL so
// we re-check after a day in case the upstream caches catch up.

type CacheEntry = { value: ResolvedPreview | null; expiresAt: number };
const _cache = new Map<string, CacheEntry>();
const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_CACHE = 2000;

function cacheKey(args: ResolveArgs): string {
  const artist = (args.artist ?? args.artists?.[0] ?? "").trim().toLowerCase();
  return [
    args.track_id ?? "",
    (args.isrc ?? "").trim().toUpperCase(),
    artist,
    (args.name ?? "").trim().toLowerCase(),
  ].join("|");
}

function cacheGet(key: string): ResolvedPreview | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    _cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: ResolvedPreview | null): void {
  const ttl = value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  _cache.set(key, { value, expiresAt: Date.now() + ttl });
  if (_cache.size > MAX_CACHE) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
}

// ─── Match verification ────────────────────────────────────────────────────
// Only used on non-deterministic (non-ISRC) paths. The bidirectional
// substring check after normalisation handles "Featuring", "vs", "&", and
// most accent / casing / punctuation differences without rejecting
// legitimate matches.

function normaliseForMatch(s: string | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/\s*\([^)]*\)\s*/g, " ") // strip parentheticals
    .replace(/\s*\[[^\]]*\]\s*/g, " ") // strip brackets ([Original Mix] etc)
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Bidirectional substring match — handles "Artist X" requesting and
 *  matching "Artist X feat. Y", or vice versa. */
function tokensAlign(a: string | undefined, b: string | undefined): boolean {
  const na = normaliseForMatch(a);
  const nb = normaliseForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

// ─── Fetch with timeout ────────────────────────────────────────────────────

const SINGLE_TIMEOUT_MS = 4_000;

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SINGLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Spotify ───────────────────────────────────────────────────────────────

async function fromSpotify(trackId: string): Promise<ResolvedPreview | null> {
  if (!spotifyIsConfigured()) return null;
  try {
    const track = await getTrack(trackId);
    if (!track?.preview_url) return null;
    return {
      url: track.preview_url,
      source: "spotify",
      // Spotify preview is always 30s.
      duration_ms: 30_000,
      match_note: "spotify.preview_url",
      matched_name: track.name,
      matched_artist: track.artists[0]?.name,
    };
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      extra: { step: "previewResolver.fromSpotify", trackId },
    });
    return null;
  }
}

// ─── iTunes ────────────────────────────────────────────────────────────────

interface ItunesResult {
  previewUrl?: string;
  trackTimeMillis?: number;
  artistName?: string;
  trackName?: string;
}
interface ItunesResponse {
  resultCount?: number;
  results?: ItunesResult[];
}

function stripParenthetical(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

/** Find the first iTunes hit that has a preview AND matches the expected
 *  artist (and optionally track name). Returns null when nothing
 *  qualifies — the caller falls through to the next source. The old
 *  behaviour (firstPreview unconditional) was the wrong-song bug. */
function pickItunesMatch(
  json: ItunesResponse | null,
  expectedArtist: string,
  expectedName?: string
): ResolvedPreview | null {
  for (const r of json?.results ?? []) {
    if (typeof r.previewUrl !== "string" || !r.previewUrl) continue;
    if (!tokensAlign(r.artistName, expectedArtist)) continue;
    if (expectedName && !tokensAlign(r.trackName, expectedName)) continue;
    return {
      url: r.previewUrl,
      source: "itunes",
      duration_ms:
        typeof r.trackTimeMillis === "number" && Number.isFinite(r.trackTimeMillis)
          ? r.trackTimeMillis
          : null,
      matched_name: r.trackName,
      matched_artist: r.artistName,
    };
  }
  return null;
}

async function fromItunes(
  args: ResolveArgs
): Promise<ResolvedPreview | null> {
  // 1. ISRC — deterministic, doesn't need artist verification (the code
  //    IS the recording identifier; if iTunes serves a preview for that
  //    ISRC, it's the same recording).
  const isrc = (args.isrc ?? "").trim();
  if (isrc) {
    const lookup = await fetchJson<ItunesResponse>(
      `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(isrc)}&entity=song&limit=5`
    );
    const hit = (lookup?.results ?? []).find(
      (r) => typeof r.previewUrl === "string" && r.previewUrl
    );
    if (hit?.previewUrl) {
      return {
        url: hit.previewUrl,
        source: "itunes",
        duration_ms:
          typeof hit.trackTimeMillis === "number" && Number.isFinite(hit.trackTimeMillis)
            ? hit.trackTimeMillis
            : null,
        match_note: "itunes.isrc",
        matched_name: hit.trackName,
        matched_artist: hit.artistName,
      };
    }
  }

  const name = (args.name ?? "").trim();
  const artist = (args.artist ?? args.artists?.[0] ?? "").trim();
  if (!name || !artist) return null;

  // 2. Strict — "artist track" — require artist + name alignment in the
  //    matched record. Catches ~95% of legitimate hits.
  const strict = await fetchJson<ItunesResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(
      `${artist} ${name}`
    )}&entity=musicTrack&limit=5`
  );
  const strictHit = pickItunesMatch(strict, artist, name);
  if (strictHit) return { ...strictHit, match_note: "itunes.strict" };

  // 3. Stripped — "Track Name (Original Mix)" → "Track Name", retry strict
  //    with the trimmed name. Same artist-verified picker.
  const stripped = stripParenthetical(name);
  if (stripped && stripped !== name) {
    const strippedResult = await fetchJson<ItunesResponse>(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        `${artist} ${stripped}`
      )}&entity=musicTrack&limit=5`
    );
    const hit = pickItunesMatch(strippedResult, artist, stripped);
    if (hit) return { ...hit, match_note: "itunes.stripped" };
  }

  // 4. Artist-only fuzzy — drop the name from the query but STILL require
  //    the matched record's artist to align. This is the "find anything by
  //    this artist with a preview" net for catalogues where iTunes has the
  //    wrong title or a regional variant. The previous code dropped the
  //    artist instead, which is what caused the wrong-song bug — track
  //    names like "Underground" matched random unrelated artists.
  const artistOnly = await fetchJson<ItunesResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(
      artist
    )}&entity=musicTrack&limit=10`
  );
  const artistOnlyHit = pickItunesMatch(artistOnly, artist, name);
  if (artistOnlyHit) return { ...artistOnlyHit, match_note: "itunes.artist_only" };

  // No artist-aligned match → return null. Don't fall through to a
  // wildly-wrong song.
  return null;
}

// ─── Deezer ────────────────────────────────────────────────────────────────

interface DeezerTrack {
  preview?: string;
  duration?: number; // seconds
  title?: string;
  artist?: { name?: string };
}
interface DeezerResponse {
  data?: DeezerTrack[];
  total?: number;
  error?: { code?: number; message?: string };
}

function pickDeezerMatch(
  json: DeezerResponse | null,
  expectedArtist: string,
  expectedName?: string
): ResolvedPreview | null {
  for (const r of json?.data ?? []) {
    if (typeof r.preview !== "string" || !r.preview) continue;
    if (!tokensAlign(r.artist?.name, expectedArtist)) continue;
    if (expectedName && !tokensAlign(r.title, expectedName)) continue;
    return {
      url: r.preview,
      source: "deezer",
      duration_ms:
        typeof r.duration === "number" && Number.isFinite(r.duration)
          ? r.duration * 1000
          : null,
      matched_name: r.title,
      matched_artist: r.artist?.name,
    };
  }
  return null;
}

async function fromDeezer(
  args: ResolveArgs
): Promise<ResolvedPreview | null> {
  const name = (args.name ?? "").trim();
  const artist = (args.artist ?? args.artists?.[0] ?? "").trim();
  if (!name || !artist) return null;

  // 1. Strict — artist:"X" track:"Y", artist + name verified
  const strictQuery = `artist:"${artist}" track:"${name}"`;
  const strict = await fetchJson<DeezerResponse>(
    `https://api.deezer.com/search?q=${encodeURIComponent(strictQuery)}&limit=5`
  );
  const strictHit = pickDeezerMatch(strict, artist, name);
  if (strictHit) return { ...strictHit, match_note: "deezer.strict" };

  // 2. Free text — "artist track", same verification
  const free = await fetchJson<DeezerResponse>(
    `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${name}`)}&limit=5`
  );
  const freeHit = pickDeezerMatch(free, artist, name);
  if (freeHit) return { ...freeHit, match_note: "deezer.free" };

  return null;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve a preview URL for a track. Tries Spotify → iTunes → Deezer in
 * that order. Returns the first artist-verified hit or null if nothing
 * matches confidently.
 *
 * Safe to call without a Spotify track_id — falls back to iTunes/Deezer
 * with the supplied name+artist (artist required for those paths).
 */
export async function resolvePreviewUrl(
  args: ResolveArgs
): Promise<ResolvedPreview | null> {
  const key = cacheKey(args);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  // 1. Spotify — by track_id, no fuzziness.
  if (args.track_id) {
    const hit = await fromSpotify(args.track_id);
    if (hit) {
      cacheSet(key, hit);
      return hit;
    }
  }

  // 2. iTunes — ISRC lookup first, then artist-verified search ladder.
  const itunesHit = await fromItunes(args);
  if (itunesHit) {
    cacheSet(key, itunesHit);
    return itunesHit;
  }

  // 3. Deezer — last-chance fallback, same verification.
  const deezerHit = await fromDeezer(args);
  if (deezerHit) {
    cacheSet(key, deezerHit);
    return deezerHit;
  }

  cacheSet(key, null);
  return null;
}

// Exported for tests.
export const __test = { tokensAlign, normaliseForMatch };
