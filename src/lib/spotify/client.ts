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
import { createHash } from "node:crypto";

// ─── Transient-failure-tolerant fetch ──────────────────────────────────────
// Vercel cold starts + Spotify's OAuth occasionally 5xx or flake for a
// second. Without a retry the iOS picker shows "Couldn't search — HTTP
// 502" on that first request, which looks like a broken integration.
// One retry after 200ms fixes that without masking genuine outages.
//
// Retries only on network errors / 5xx / timeouts. 4xx propagates
// immediately — those are authentic caller mistakes (bad params, etc).

const SPOTIFY_TIMEOUT_MS = 8_000;
const SPOTIFY_RETRY_DELAY_MS = 200;

async function spotifyFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SPOTIFY_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const first = await attempt();
    if (first.status < 500) return first;
    // 5xx → one retry
    await new Promise((r) => setTimeout(r, SPOTIFY_RETRY_DELAY_MS));
    return await attempt();
  } catch (err) {
    // Network error / abort / DNS — same retry semantics.
    await new Promise((r) => setTimeout(r, SPOTIFY_RETRY_DELAY_MS));
    try {
      return await attempt();
    } catch {
      throw err;
    }
  }
}

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
  // ISRC — passed straight through from Spotify when present. Lets the
  // client hit `itunes.apple.com/lookup?isrc=…` for deterministic Apple
  // Music matches instead of name/artist fuzzy search.
  isrc: string | null;
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
  const response = await spotifyFetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
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
  external_ids?: { isrc?: string; ean?: string; upc?: string };
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
  const isrcRaw = typeof raw.external_ids?.isrc === "string" ? raw.external_ids.isrc.trim() : "";
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
    isrc: isrcRaw || null,
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
 * Search Spotify's track catalog. Returns up to `limit` tracks
 * (max 10 — Spotify's search endpoint silently tightened the limit from 50
 * to 10 in 2025; the docs still say 50 but the API returns 400 "Invalid
 * limit" at 11+). For larger result sets the caller paginates via `offset`.
 *
 * Empty result when the query is too short — caller should validate length
 * before calling.
 */
export async function searchTracks(
  query: string,
  limit = 10,
  offset = 0
): Promise<SpotifyTrack[]> {
  const q = query.trim();
  const cappedLimit = Math.max(1, Math.min(10, Math.round(limit)));
  const cappedOffset = Math.max(0, Math.min(990, Math.round(offset))); // Spotify max offset is 1000
  const cacheKey = `${q}|${cappedLimit}|${cappedOffset}`;
  const cached = cacheGet(_searchCache, cacheKey);
  if (cached) return cached;

  const token = await getAppToken();
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("type", "track");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(cappedLimit));
  if (cappedOffset > 0) {
    url.searchParams.set("offset", String(cappedOffset));
  }
  // UK market by default — Harry's audience is UK techno scene. Spotify
  // surfaces region-available tracks when `market` is set. Can be made a
  // query param later if we add other markets.
  url.searchParams.set("market", "GB");

  const response = await spotifyFetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
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
  const response = await spotifyFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Spotify returns 404 for "no such track" AND 400 for "malformed id"
  // ("Invalid base62 id"). Both mean "this track id isn't valid" from
  // the caller's perspective — don't fail open on either, tell iOS.
  if (response.status === 404 || response.status === 400) return null;
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

// ─── Playlist endpoints ────────────────────────────────────────────────────
// Used by the trending-track refresh cron. No in-process cache here — the
// caller (cron) controls cadence and persists results to the DB pool.

export interface SpotifyPlaylistMeta {
  id: string;
  name: string;
  snapshot_id: string;
  followers: number;
  total_tracks: number;
}

export interface SpotifyPlaylistTrack {
  track: SpotifyTrack;
  added_at: string; // ISO timestamp
  position: number; // 0-indexed within the playlist
  popularity: number; // 0..100 from Spotify
}

interface RawPlaylistTrackItem {
  added_at?: string;
  track?: (RawSpotifyTrack & { popularity?: number; is_local?: boolean }) | null;
}

interface RawPlaylistEnvelope {
  id: string;
  name?: string;
  snapshot_id?: string;
  followers?: { total?: number };
  tracks?: {
    total?: number;
    items?: RawPlaylistTrackItem[];
    next?: string | null;
  };
}

/**
 * Fetch playlist metadata + the first page of tracks. Use snapshot_id to
 * decide whether a refresh is even needed (Spotify changes it whenever the
 * curator adds/removes/reorders).
 *
 * Returns null when Spotify 404s (playlist deleted or made private).
 * Throws on 5xx so the cron retries on next run.
 */
export async function getPlaylistMeta(
  playlistId: string
): Promise<SpotifyPlaylistMeta | null> {
  const cleaned = playlistId.trim();
  if (!cleaned) return null;

  const token = await getAppToken();
  // `fields` keeps the response small — we only need meta on this call.
  const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(
    cleaned
  )}?market=GB&fields=id,name,snapshot_id,followers(total),tracks(total)`;
  const response = await spotifyFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spotify playlist meta failed: ${response.status} ${body.slice(0, 200)}`
    );
  }

  const raw = (await response.json()) as RawPlaylistEnvelope;
  return {
    id: raw.id,
    name: raw.name ?? "",
    snapshot_id: raw.snapshot_id ?? "",
    followers: raw.followers?.total ?? 0,
    total_tracks: raw.tracks?.total ?? 0,
  };
}

/**
 * Fetch all tracks in a playlist, paginating through Spotify's 100-per-page
 * limit. Filters out local tracks (no Spotify id) and null entries (deleted
 * tracks linger as empty items). Each item carries position + added_at +
 * popularity so the smart-mix algorithm can rank them.
 *
 * Hard-capped at 500 tracks to keep cron runtime predictable. Editorial
 * playlists average 50–100 tracks; pulling 500 covers every realistic case.
 */
export async function getPlaylistTracks(
  playlistId: string,
  options: { maxTracks?: number } = {}
): Promise<SpotifyPlaylistTrack[]> {
  const cleaned = playlistId.trim();
  if (!cleaned) return [];

  const maxTracks = Math.max(1, Math.min(500, options.maxTracks ?? 200));
  const pageSize = 100;
  const token = await getAppToken();

  const out: SpotifyPlaylistTrack[] = [];
  let offset = 0;

  while (out.length < maxTracks) {
    const url = new URL(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(cleaned)}/tracks`
    );
    url.searchParams.set("market", "GB");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    // Trim the response to only the fields we care about.
    url.searchParams.set(
      "fields",
      "items(added_at,track(id,name,artists(id,name),album(name,images),preview_url,duration_ms,external_urls,external_ids,popularity,is_local)),next"
    );

    const response = await spotifyFetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) break; // playlist disappeared mid-paginate
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Spotify playlist tracks failed: ${response.status} ${body.slice(0, 200)}`
      );
    }

    const json = (await response.json()) as {
      items?: RawPlaylistTrackItem[];
      next?: string | null;
    };
    const items = json.items ?? [];
    for (const item of items) {
      const raw = item.track;
      if (!raw || !raw.id || raw.is_local) continue;
      out.push({
        track: mapTrack(raw),
        added_at: item.added_at ?? new Date().toISOString(),
        position: offset + items.indexOf(item),
        popularity: typeof raw.popularity === "number" ? raw.popularity : 0,
      });
      if (out.length >= maxTracks) break;
    }
    if (!json.next || items.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

// ─── Embed-page playlist fallback ──────────────────────────────────────────
// Why this exists:
//   Spotify deprecated bulk playlist track access for new Web API apps
//   (Nov 2024 changes — both /playlists/{id}/tracks and the batch
//   /tracks?ids= endpoints return 403 Forbidden). Single-track lookup
//   (/tracks/{id}) still works under Client Credentials. The official
//   answer is to apply for Extended Quota Mode, which we are not doing.
//
//   The public embed page at open.spotify.com/embed/playlist/{id} renders
//   the full track list (up to 100) as server-side React state in a
//   __NEXT_DATA__ <script> tag. It's the same data Spotify ships to any
//   third party rendering an embed widget — no auth, designed for cross-
//   origin consumption. We parse it to get track IDs + positions, then
//   call the working single-track endpoint to enrich each with album art,
//   popularity, ISRC.
//
//   Brittleness note: this depends on Spotify's embed HTML structure. If
//   they change the script id or shape of `state.data.entity.trackList`,
//   this breaks silently. Embed pages have been Next.js-rendered with
//   this shape since ~2022, so it's stable, but worth watching.

export interface EmbedPlaylistTrack {
  id: string;
  position: number;
}

export interface EmbedPlaylistResult {
  id: string;
  name: string;
  /** Synthesized from a hash of ordered track IDs — embed has no snapshot_id. */
  synthetic_snapshot_id: string;
  total_tracks: number;
  tracks: EmbedPlaylistTrack[];
}

interface RawEmbedTrack {
  uri?: string;
  title?: string;
}

interface RawEmbedNextData {
  props?: {
    pageProps?: {
      state?: {
        data?: {
          entity?: {
            title?: string;
            trackList?: RawEmbedTrack[];
          };
        };
      };
    };
  };
}

function syntheticSnapshot(trackIds: string[]): string {
  // Stable fingerprint for "did the playlist change?" — not security-sensitive,
  // just used to short-circuit the heavy diff path in playlist-refresh.
  return createHash("sha1").update(trackIds.join(",")).digest("hex").slice(0, 16);
}

/**
 * Pull a playlist's track list (IDs + positions) from Spotify's public
 * embed page. Returns null when Spotify 404s the embed (playlist deleted
 * or made private). Throws on transient failures so the cron retries.
 */
export async function getPlaylistViaEmbed(
  playlistId: string
): Promise<EmbedPlaylistResult | null> {
  const cleaned = playlistId.trim();
  if (!cleaned) return null;

  // Pretend to be a normal browser — the embed page is public but Spotify's
  // edge will sometimes serve a stripped page to obvious automation UAs.
  const response = await spotifyFetch(
    `https://open.spotify.com/embed/playlist/${encodeURIComponent(cleaned)}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        Accept: "text/html",
      },
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Spotify embed failed: ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/
  );
  if (!match) {
    throw new Error("Spotify embed: __NEXT_DATA__ not found");
  }

  let parsed: RawEmbedNextData;
  try {
    parsed = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(
      `Spotify embed: __NEXT_DATA__ JSON parse failed (${err instanceof Error ? err.message : "unknown"})`
    );
  }

  const entity = parsed.props?.pageProps?.state?.data?.entity;
  const list = entity?.trackList ?? [];
  const tracks: EmbedPlaylistTrack[] = [];
  for (let i = 0; i < list.length; i++) {
    const uri = list[i]?.uri;
    if (!uri || !uri.startsWith("spotify:track:")) continue;
    const id = uri.slice("spotify:track:".length);
    if (!/^[A-Za-z0-9]{22}$/.test(id)) continue; // sanity — Spotify track ids are 22 base62
    tracks.push({ id, position: i });
  }

  return {
    id: cleaned,
    name: entity?.title ?? "",
    synthetic_snapshot_id: syntheticSnapshot(tracks.map((t) => t.id)),
    total_tracks: tracks.length,
    tracks,
  };
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
