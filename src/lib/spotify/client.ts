/**
 * Spotify Web API client — server-side proxy for track search + lookup.
 *
 * The iOS client handles user auth (for playback via the Spotify SDK).
 * This module handles **metadata** search + lookup via the Client
 * Credentials flow so the client secret never leaves the backend.
 *
 * Env vars (both required for live mode):
 *   SPOTIFY_CLIENT_ID     — public, safe in Vercel + code
 *   SPOTIFY_CLIENT_SECRET — server-only, NEVER expose to iOS
 *
 * If either is missing, isConfigured() returns false and callers treat
 * the integration as unavailable. Story POST validation fails open so
 * local dev without creds still works.
 */

import * as Sentry from "@sentry/nextjs";

// ─── Types — the iOS-facing DTO shape ──────────────────────────────────────

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  name: string;
  image_url: string | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  preview_url: string | null;
  duration_ms: number;
  external_url: string;
}

// ─── Config ────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
      process.env.SPOTIFY_CLIENT_SECRET?.trim()
  );
}

// ─── App token cache ───────────────────────────────────────────────────────
// Spotify app tokens expire at 60 minutes. Cache with a 50-minute TTL so
// we never hand a stale token to Spotify. Module-scope cache survives
// across requests in the same Node process (good for Vercel serverless
// warm invocations).

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let _tokenCache: CachedToken | null = null;

async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spotify token request failed: ${response.status} ${body.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Spotify token response missing access_token");
  }

  // Use the shorter of (50 min, Spotify-reported - 10 min) for the cache TTL
  // so we always have a healthy margin before expiry.
  const ttlSeconds = Math.min(
    50 * 60,
    Math.max(60, (json.expires_in ?? 3600) - 600)
  );
  _tokenCache = {
    token: json.access_token,
    expiresAt: now + ttlSeconds * 1000,
  };
  return json.access_token;
}

// ─── Response mapping ──────────────────────────────────────────────────────

interface RawSpotifyTrack {
  id: string;
  name: string;
  artists?: { id?: string; name?: string }[];
  album?: {
    name?: string;
    images?: { url?: string; width?: number; height?: number }[];
  };
  preview_url?: string | null;
  duration_ms?: number;
  external_urls?: { spotify?: string };
}

function pickBestAlbumImage(
  images?: { url?: string; width?: number }[]
): string | null {
  if (!images || images.length === 0) return null;
  // Spotify ships album art at 640 / 300 / 64. iOS viewers look best with
  // a square ~500 so 640 wins. Fall back to whichever exists.
  const byWidth = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return byWidth[0]?.url ?? images[0].url ?? null;
}

function mapTrack(raw: RawSpotifyTrack): SpotifyTrack {
  return {
    id: raw.id,
    name: raw.name ?? "",
    artists: (raw.artists ?? [])
      .filter((a) => a.id && a.name)
      .map((a) => ({ id: a.id as string, name: a.name as string })),
    album: {
      name: raw.album?.name ?? "",
      image_url: pickBestAlbumImage(raw.album?.images),
    },
    preview_url: raw.preview_url ?? null,
    duration_ms: raw.duration_ms ?? 0,
    external_url: raw.external_urls?.spotify ?? `https://open.spotify.com/track/${raw.id}`,
  };
}

// ─── Per-process result cache ──────────────────────────────────────────────
// Search queries cached ~5 min. Track lookups cached ~1h. Same-process
// warm Vercel invocations benefit; cold starts pay full latency.

type CacheEntry<T> = { value: T; expiresAt: number };
const _searchCache = new Map<string, CacheEntry<SpotifyTrack[]>>();
const _trackCache = new Map<string, CacheEntry<SpotifyTrack>>();
const SEARCH_TTL_MS = 5 * 60 * 1000;
const TRACK_TTL_MS = 60 * 60 * 1000;

function cacheGet<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Cap map size to avoid unbounded growth in long-lived dev servers.
  if (store.size > 500) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Search Spotify's track catalog. Returns up to `limit` tracks (max 50).
 * Empty result when the query is too short — caller should validate length
 * before calling.
 */
export async function searchTracks(
  query: string,
  limit = 20
): Promise<SpotifyTrack[]> {
  const q = query.trim();
  const cappedLimit = Math.max(1, Math.min(50, Math.round(limit)));
  const cacheKey = `${q}|${cappedLimit}`;
  const cached = cacheGet(_searchCache, cacheKey);
  if (cached) return cached;

  const token = await getAppToken();
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("type", "track");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(cappedLimit));
  // UK market by default — Harry's audience is UK techno scene. Spotify
  // surfaces region-available tracks when `market` is set. Can be made a
  // query param later if we add other markets.
  url.searchParams.set("market", "GB");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spotify search failed: ${response.status} ${body.slice(0, 200)}`
    );
  }

  const json = (await response.json()) as {
    tracks?: { items?: RawSpotifyTrack[] };
  };
  const tracks = (json.tracks?.items ?? []).map(mapTrack);
  cacheSet(_searchCache, cacheKey, tracks, SEARCH_TTL_MS);
  return tracks;
}

/**
 * Look up a single track by Spotify id. Returns null if not found (404).
 * Throws on 5xx / network errors — callers that need fail-open behavior
 * should catch.
 */
export async function getTrack(id: string): Promise<SpotifyTrack | null> {
  const cleaned = id.trim();
  if (!cleaned) return null;

  const cached = cacheGet(_trackCache, cleaned);
  if (cached) return cached;

  const token = await getAppToken();
  const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(
    cleaned
  )}?market=GB`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spotify track lookup failed: ${response.status} ${body.slice(0, 200)}`
    );
  }

  const raw = (await response.json()) as RawSpotifyTrack;
  const track = mapTrack(raw);
  cacheSet(_trackCache, cleaned, track, TRACK_TTL_MS);
  return track;
}

/**
 * Validate a track_id against Spotify as a fail-open guard when a rep
 * posts a story. Returns:
 *   { ok: true, track }                when Spotify confirms the id.
 *   { ok: false, reason: 'not_found' } when Spotify 404s.
 *   { ok: false, reason: 'unreachable' } when Spotify or our creds are down
 *                                        — caller should fail OPEN per the
 *                                        product rule (don't let Spotify
 *                                        outages block rep posting).
 *
 * Never throws — every failure mode is represented in the return shape.
 */
export async function verifyTrackForStory(
  id: string
): Promise<
  | { ok: true; track: SpotifyTrack }
  | { ok: false; reason: "not_found" | "unreachable" }
> {
  if (!isConfigured()) {
    return { ok: false, reason: "unreachable" };
  }
  try {
    const track = await getTrack(id);
    if (!track) return { ok: false, reason: "not_found" };
    return { ok: true, track };
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      extra: { spotifyTrackId: id, step: "verifyTrackForStory" },
    });
    return { ok: false, reason: "unreachable" };
  }
}
