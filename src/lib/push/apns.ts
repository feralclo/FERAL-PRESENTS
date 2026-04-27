/**
 * APNs transport — HTTP/2 provider using Apple's token-based auth (P8 key).
 *
 * Credentials (env vars):
 *   APNS_AUTH_KEY_P8     — raw PEM content of the .p8 file
 *   APNS_KEY_ID          — Key ID from the Apple Developer portal
 *   APNS_TEAM_ID         — Apple Developer Team ID (10-char alphanumeric)
 *   APNS_BUNDLE_ID       — app bundle identifier (e.g. events.entry.app)
 *   APNS_USE_SANDBOX     — 'true' for development endpoint; default production
 *
 * Without all four credential vars, isConfigured() returns false and the
 * fanout records the row as 'skipped'.
 *
 * JWT auth: ES256-signed token with iss=team_id, iat=now, kid=key_id in the
 * header. Apple rate-limits new tokens, so we cache it at module scope for
 * 50 minutes (Apple permits 20–60min reuse).
 *
 * HTTP/2: opens a session on the first send and reuses it for the lifetime
 * of the serverless invocation. Vercel functions are short-lived so a stale
 * session is unlikely; if one goes bad we tear down and reopen on the next
 * call.
 */

import * as crypto from "crypto";
// `http2` is loaded lazily inside `send()` via `await import("http2")` —
// static `import * as http2 from "http2"` makes vite/vitest externalise the
// module at jsdom module-load, and vite has no jsdom stub for http2, so the
// placeholder explodes with "No such built-in module: node:" (Vercel runs
// tests in Node 22 + jsdom). This tripped both push-apns.test.ts (direct
// importer) and webhook.test.ts (transitive — webhook → orders →
// rep-notifications → fanout → apns). Keeping the type-only reference so
// the cached session field is still typed.
import type * as http2 from "http2";
import type {
  DeviceToken,
  DeliveryResult,
  NotificationPayload,
  PushTransport,
} from "./types";

const APNS_PROD_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.development.push.apple.com";

// Apple permits reusing a provider token for 20–60 minutes. 50 min stays
// well inside the window while minimising regenerations under steady load.
const JWT_TTL_MS = 50 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

let cachedSession: http2.ClientHttp2Session | null = null;
let cachedSessionHost: string | null = null;

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Mint an ES256 JWT using the P8 private key. Cached at module scope.
 *
 * Exported for tests — production callers should use {@link getProviderToken}.
 */
export function mintApnsJwt(opts: {
  keyPem: string;
  keyId: string;
  teamId: string;
  nowSec?: number;
}): string {
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: opts.keyId, typ: "JWT" }),
  );
  const payload = base64url(
    JSON.stringify({ iss: opts.teamId, iat: now }),
  );
  const signingInput = `${header}.${payload}`;

  // dsaEncoding: 'ieee-p1363' produces the raw 64-byte (r||s) signature
  // Apple expects, instead of the DER form Node returns by default.
  const signature = crypto.sign(
    "SHA256",
    Buffer.from(signingInput),
    {
      key: opts.keyPem,
      dsaEncoding: "ieee-p1363",
    },
  );
  return `${signingInput}.${base64url(signature)}`;
}

function getProviderToken(): string {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;
  const token = mintApnsJwt({
    keyPem: process.env.APNS_AUTH_KEY_P8 as string,
    keyId: process.env.APNS_KEY_ID as string,
    teamId: process.env.APNS_TEAM_ID as string,
  });
  cachedToken = { token, expiresAt: now + JWT_TTL_MS };
  return token;
}

function getApnsHostUrl(): string {
  return process.env.APNS_USE_SANDBOX === "true"
    ? APNS_SANDBOX_HOST
    : APNS_PROD_HOST;
}

export function getApnsHost(): string {
  return getApnsHostUrl();
}

async function getOrOpenSession(): Promise<http2.ClientHttp2Session> {
  const host = getApnsHostUrl();
  if (
    cachedSession &&
    !cachedSession.closed &&
    !cachedSession.destroyed &&
    cachedSessionHost === host
  ) {
    return cachedSession;
  }
  if (cachedSession) {
    try {
      cachedSession.close();
    } catch {
      // best-effort cleanup
    }
  }
  const http2Mod = await import("http2");
  cachedSession = http2Mod.connect(host);
  cachedSessionHost = host;
  // Drop the cache if the connection errors out so the next send opens a
  // fresh one rather than re-using a dead session.
  cachedSession.on("error", () => {
    cachedSession = null;
    cachedSessionHost = null;
  });
  cachedSession.on("close", () => {
    cachedSession = null;
    cachedSessionHost = null;
  });
  return cachedSession;
}

/**
 * Map an APNs HTTP response (status + parsed body reason) to our internal
 * DeliveryResult. Pure function so tests don't need the network.
 *
 * Reason codes per Apple docs:
 *   https://developer.apple.com/documentation/usernotifications/handling_notification_responses_from_apns
 */
export function mapApnsResponse(
  status: number,
  reason: string | undefined,
  responseMs: number,
): DeliveryResult {
  if (status === 200) {
    return { status: "sent", transport_response_ms: responseMs };
  }
  // Tokens that are no longer valid — Apple wants us to stop sending.
  if (
    status === 410 ||
    reason === "Unregistered" ||
    reason === "BadDeviceToken" ||
    reason === "DeviceTokenNotForTopic"
  ) {
    return {
      status: "invalid_token",
      error_message: reason ?? `apns ${status}`,
      transport_response_ms: responseMs,
    };
  }
  // Provider-token issues — surface clearly so misconfigured Vercel env
  // shows up in notification_deliveries instead of looking like a bad
  // device.
  if (
    reason === "ExpiredProviderToken" ||
    reason === "InvalidProviderToken" ||
    reason === "MissingProviderToken"
  ) {
    return {
      status: "failed",
      error_message: `apns auth: ${reason}`,
      transport_response_ms: responseMs,
    };
  }
  return {
    status: "failed",
    error_message: reason ? `apns ${status}: ${reason}` : `apns ${status}`,
    transport_response_ms: responseMs,
  };
}

class ApnsTransport implements PushTransport {
  platform: "ios" = "ios";

  isConfigured(): boolean {
    return Boolean(
      process.env.APNS_AUTH_KEY_P8 &&
        process.env.APNS_KEY_ID &&
        process.env.APNS_TEAM_ID &&
        process.env.APNS_BUNDLE_ID,
    );
  }

  async send(
    device: DeviceToken,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const start = Date.now();

    if (!this.isConfigured()) {
      return {
        status: "skipped",
        error_message: "APNS_* env vars not configured",
        transport_response_ms: Date.now() - start,
      };
    }

    const envelope = buildApnsEnvelope(payload);
    const body = JSON.stringify(envelope);
    const bundleId = process.env.APNS_BUNDLE_ID as string;

    let providerToken: string;
    try {
      providerToken = getProviderToken();
    } catch (err) {
      return {
        status: "failed",
        error_message:
          err instanceof Error ? `apns jwt: ${err.message}` : "apns jwt error",
        transport_response_ms: Date.now() - start,
      };
    }

    let session: http2.ClientHttp2Session;
    try {
      session = await getOrOpenSession();
    } catch (err) {
      return {
        status: "failed",
        error_message:
          err instanceof Error
            ? `apns connect: ${err.message}`
            : "apns connect error",
        transport_response_ms: Date.now() - start,
      };
    }

    return new Promise<DeliveryResult>((resolve) => {
      const req = session.request({
        ":method": "POST",
        ":path": `/3/device/${device.token}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json",
      });

      let status = 0;
      let responseBody = "";
      let settled = false;
      const settle = (result: DeliveryResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      req.on("response", (headers) => {
        status = Number(headers[":status"]) || 0;
      });
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        responseBody += chunk;
      });
      req.on("end", () => {
        let reason: string | undefined;
        if (responseBody) {
          try {
            const parsed = JSON.parse(responseBody) as { reason?: string };
            reason = parsed.reason;
          } catch {
            // 200s and many 410s have empty bodies — that's fine.
          }
        }
        settle(mapApnsResponse(status, reason, Date.now() - start));
      });
      req.on("error", (err) => {
        settle({
          status: "failed",
          error_message: `apns request: ${err.message}`,
          transport_response_ms: Date.now() - start,
        });
      });

      // Hard ceiling so a hung HTTP/2 stream can't wedge the fanout.
      // 0x8 is NGHTTP2_CANCEL per RFC 7540 §7 — fixed by the HTTP/2 spec,
      // safe to inline so we don't have to load `http2.constants` here.
      const timeout = setTimeout(() => {
        try {
          req.close(0x8);
        } catch {
          // best-effort
        }
        settle({
          status: "failed",
          error_message: "apns timeout",
          transport_response_ms: Date.now() - start,
        });
      }, 10_000);
      req.on("close", () => clearTimeout(timeout));

      req.end(body);
    });
  }
}

export const apns: PushTransport = new ApnsTransport();

/**
 * Reset module-scope caches. Test-only; never call from production paths.
 */
export function _resetApnsCachesForTests(): void {
  cachedToken = null;
  if (cachedSession) {
    try {
      cachedSession.close();
    } catch {
      // best-effort
    }
  }
  cachedSession = null;
  cachedSessionHost = null;
}

// ---------------------------------------------------------------------------
// Envelope builder — kept public so tests can assert on shape without
// needing real credentials. This is the contract iOS's native-notification
// extension parses.
// ---------------------------------------------------------------------------

export function buildApnsEnvelope(payload: NotificationPayload) {
  return {
    aps: {
      alert: {
        title: payload.title,
        ...(payload.body ? { body: payload.body } : {}),
      },
      sound: "default",
      "mutable-content": 1,
    },
    type: payload.type,
    ...(payload.deep_link ? { deep_link: payload.deep_link } : {}),
    ...(payload.data ? { data: payload.data } : {}),
  };
}
