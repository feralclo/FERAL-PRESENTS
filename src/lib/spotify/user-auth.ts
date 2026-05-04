import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";

/**
 * Spotify Web API — user (rep) auth flow.
 *
 * Distinct from `lib/spotify/client.ts`, which uses the Client Credentials
 * grant for app-level metadata reads. This module handles the Authorization
 * Code grant: a rep links their personal Spotify account so we can store
 * a refresh token + display name + premium status.
 *
 * Tokens are AES-256-GCM encrypted at the application layer before being
 * written to `spotify_user_tokens`. The Postgres column is text, so service
 * role read access alone never yields plaintext credentials — an attacker
 * also needs SPOTIFY_TOKEN_ENC_KEY (or the SUPABASE_SERVICE_ROLE_KEY base
 * fallback) to recover them.
 *
 * The CSRF state token is HMAC-signed and binds the round-trip to a single
 * rep + 15-minute window, so the iOS-mediated `entry://` redirect can't be
 * tampered with to attach a Spotify account to the wrong rep.
 */

// ─── Configuration ─────────────────────────────────────────────────────────

const STATE_TTL_MS = 15 * 60 * 1000;
const REDIRECT_URI_PATH = "/api/rep-portal/spotify/oauth-callback";

/**
 * Scopes requested at authorize time. Matches the iOS contract:
 *   - user-read-private        (display_name)
 *   - user-read-email          (linking)
 *   - user-library-read        (saved tracks for personalised search later)
 * Streaming + playback scopes will be added if/when we ship author preview.
 */
export const SPOTIFY_USER_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
] as const;

export function isUserAuthConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
      process.env.SPOTIFY_CLIENT_SECRET?.trim()
  );
}

/**
 * Resolve the redirect URI sent to Spotify. MUST match a redirect URI
 * registered on the Spotify app dashboard. Prefer the explicit env var
 * so production + preview environments can register their exact URLs;
 * fall back to NEXT_PUBLIC_SITE_URL so local dev with one site URL works
 * without a second env var.
 */
export function getRedirectUri(): string {
  const explicit = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) {
    throw new Error(
      "SPOTIFY_REDIRECT_URI or NEXT_PUBLIC_SITE_URL must be set for Spotify connect"
    );
  }
  return base.replace(/\/$/, "") + REDIRECT_URI_PATH;
}

// ─── Encryption (AES-256-GCM) ──────────────────────────────────────────────
// Envelope is `iv:ciphertext:tag`, each base64-encoded with `:` separators.
// IV is 12 bytes (GCM standard); auth tag is 16 bytes.

function getEncryptionKey(): Buffer {
  const explicit = process.env.SPOTIFY_TOKEN_ENC_KEY?.trim();
  if (explicit) {
    // Either 32 raw bytes hex-encoded (64 chars) or any string we hash to 32.
    if (/^[0-9a-f]{64}$/i.test(explicit)) {
      return Buffer.from(explicit, "hex");
    }
    return crypto.createHash("sha256").update(explicit).digest();
  }
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) {
    throw new Error(
      "SPOTIFY_TOKEN_ENC_KEY or SUPABASE_SERVICE_ROLE_KEY required to encrypt Spotify tokens"
    );
  }
  return crypto
    .createHmac("sha256", base)
    .update("spotify-user-token-enc-v1")
    .digest();
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptToken(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid token envelope");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

// ─── State token (HMAC-signed, rep-bound) ──────────────────────────────────

function getStateSecret(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign Spotify OAuth state");
  }
  return crypto
    .createHmac("sha256", base)
    .update("spotify-user-oauth-state-v1")
    .digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signState(repId: string): string {
  const payload = { repId, nonce: crypto.randomUUID(), ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", getStateSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export type StateVerification =
  | { ok: true; repId: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyState(state: string): StateVerification {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;

  let expected: Buffer;
  let received: Buffer;
  try {
    expected = crypto.createHmac("sha256", getStateSecret()).update(body).digest();
    received = b64urlDecode(sig);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (expected.length !== received.length) return { ok: false, reason: "bad_signature" };
  if (!crypto.timingSafeEqual(expected, received)) return { ok: false, reason: "bad_signature" };

  let payload: { repId?: unknown; ts?: unknown };
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const repId = typeof payload.repId === "string" ? payload.repId : null;
  const ts = typeof payload.ts === "number" ? payload.ts : null;
  if (!repId || !ts) return { ok: false, reason: "malformed" };
  if (Date.now() - ts > STATE_TTL_MS) return { ok: false, reason: "expired" };

  return { ok: true, repId };
}

// ─── URL builders ──────────────────────────────────────────────────────────

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is not set");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_USER_SCOPES.join(" "),
    redirect_uri: getRedirectUri(),
    state,
    // Re-show the consent dialog every time so the rep sees what they're
    // granting — the Spotify default re-uses prior consent silently.
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// ─── Token exchange + /me ──────────────────────────────────────────────────

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number; // seconds
  refresh_token?: string;
}

interface SpotifyMe {
  id: string;
  display_name: string | null;
  product: "premium" | "free" | "open" | string;
}

function basicAuthHeader(): string {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("Spotify credentials not configured");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

export async function fetchSpotifyMe(accessToken: string): Promise<SpotifyMe> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify /me failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SpotifyMe;
}

/**
 * Best-effort token revocation. Spotify doesn't expose a real revoke
 * endpoint for user tokens — the closest signal is that deleting the
 * connection in our DB stops us using the refresh token. This function
 * exists so callers can register intent (and so we have a single hook
 * if Spotify ever ships /revoke). Never throws.
 */
export async function revokeTokensBestEffort(
  _accessToken: string,
  _refreshToken: string
): Promise<void> {
  try {
    // No public Spotify revoke endpoint as of 2026-05. Document and move on.
    return;
  } catch (err) {
    Sentry.captureException(err, { level: "warning" });
  }
}
