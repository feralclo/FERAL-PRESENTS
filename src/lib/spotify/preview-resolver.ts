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

// ─── Fetch with timeout ────────────────────────────────────────────────────
// Neither iTunes nor Deezer need auth, so a single attempt with a short
// timeout is fine — if one source flakes we move to the next. Total
// walltime is bounded at ~ (3 * SINGLE_TIMEOUT) worst-case.

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

// ─── Source implementations ────────────────────────────────────────────────

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
    };
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      extra: { step: "previewResolver.fromSpotify", trackId },
    });
    return null;
  }
}

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

function firstPreview(json: ItunesResponse | null): ResolvedPreview | null {
  const hit = (json?.results ?? []).find((r) => typeof r.previewUrl === "string" && r.previewUrl);
  if (!hit?.previewUrl) return null;
  return {
    url: hit.previewUrl,
    source: "itunes",
    duration_ms:
      typeof hit.trackTimeMillis === "number" && Number.isFinite(hit.trackTimeMillis)
        ? hit.trackTimeMillis
        : null,
  };
}

async function fromItunes(
  args: ResolveArgs
): Promise<ResolvedPreview | null> {
  // 1. ISRC — deterministic when available.
  const isrc = (args.isrc ?? "").trim();
  if (isrc) {
    const lookup = await fetchJson<ItunesResponse>(
      `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(isrc)}&entity=song&limit=5`
    );
    const hit = firstPreview(lookup);
    if (hit) return { ...hit, match_note: "itunes.isrc" };
  }

  const name = (args.name ?? "").trim();
  const artist = (args.artist ?? args.artists?.[0] ?? "").trim();
  if (!name || !artist) return null;

  // 2. Strict — "artist track"
  const strict = await fetchJson<ItunesResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(
      `${artist} ${name}`
    )}&entity=musicTrack&limit=5`
  );
  const strictHit = firstPreview(strict);
  if (strictHit) return { ...strictHit, match_note: "itunes.strict" };

  // 3. Fuzzy — drop the artist, rely on track name alone
  const fuzzy = await fetchJson<ItunesResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicTrack&limit=10`
  );
  const fuzzyHit = firstPreview(fuzzy);
  if (fuzzyHit) return { ...fuzzyHit, match_note: "itunes.fuzzy" };

  // 4. Stripped — "Track Name (Remix)" → "Track Name"
  const stripped = stripParenthetical(name);
  if (stripped && stripped !== name) {
    const strippedResult = await fetchJson<ItunesResponse>(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        `${artist} ${stripped}`
      )}&entity=musicTrack&limit=5`
    );
    const hit = firstPreview(strippedResult);
    if (hit) return { ...hit, match_note: "itunes.stripped" };
  }

  return null;
}

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

function firstDeezerPreview(json: DeezerResponse | null): ResolvedPreview | null {
  const hit = (json?.data ?? []).find((r) => typeof r.preview === "string" && r.preview);
  if (!hit?.preview) return null;
  return {
    url: hit.preview,
    source: "deezer",
    duration_ms:
      typeof hit.duration === "number" && Number.isFinite(hit.duration)
        ? hit.duration * 1000
        : null,
  };
}

async function fromDeezer(
  args: ResolveArgs
): Promise<ResolvedPreview | null> {
  const name = (args.name ?? "").trim();
  const artist = (args.artist ?? args.artists?.[0] ?? "").trim();
  if (!name || !artist) return null;

  // 1. Strict — artist:"X" track:"Y"
  const strictQuery = `artist:"${artist}" track:"${name}"`;
  const strict = await fetchJson<DeezerResponse>(
    `https://api.deezer.com/search?q=${encodeURIComponent(strictQuery)}&limit=5`
  );
  const strictHit = firstDeezerPreview(strict);
  if (strictHit) return { ...strictHit, match_note: "deezer.strict" };

  // 2. Free text — "artist track"
  const free = await fetchJson<DeezerResponse>(
    `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${name}`)}&limit=5`
  );
  const freeHit = firstDeezerPreview(free);
  if (freeHit) return { ...freeHit, match_note: "deezer.free" };

  return null;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve a preview URL for a track. Tries Spotify → iTunes → Deezer in
 * that order. Returns the first hit or null if nothing matches.
 *
 * Safe to call without a Spotify track_id — falls back to iTunes/Deezer
 * with the supplied name+artist.
 */
export async function resolvePreviewUrl(
  args: ResolveArgs
): Promise<ResolvedPreview | null> {
  const key = cacheKey(args);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  // 1. Spotify — only when a track_id is provided.
  if (args.track_id) {
    const hit = await fromSpotify(args.track_id);
    if (hit) {
      cacheSet(key, hit);
      return hit;
    }
  }

  // 2. iTunes — ISRC lookup first, then name/artist search ladder.
  const itunesHit = await fromItunes(args);
  if (itunesHit) {
    cacheSet(key, itunesHit);
    return itunesHit;
  }

  // 3. Deezer — last-chance fallback, free-text search.
  const deezerHit = await fromDeezer(args);
  if (deezerHit) {
    cacheSet(key, deezerHit);
    return deezerHit;
  }

  cacheSet(key, null);
  return null;
}
