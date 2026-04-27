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
 * Pure helpers (envelope builder, JWT mint, response mapper, host resolver)
 * live in `./apns-core` — split out so tests can import them without
 * pulling http2 into their module graph (vite/vitest externalises http2 in
 * jsdom and the externalised stub faults at runtime).
 */

import type * as http2 from "http2";
import type {
  DeviceToken,
  DeliveryResult,
  NotificationPayload,
  PushTransport,
} from "./types";
import {
  buildApnsEnvelope,
  getApnsHost,
  mapApnsResponse,
  mintApnsJwt,
} from "./apns-core";

// Re-export the pure helpers so existing imports of `@/lib/push/apns`
// still resolve. Tests should prefer importing directly from `./apns-core`.
export { buildApnsEnvelope, getApnsHost, mapApnsResponse, mintApnsJwt };

const JWT_TTL_MS = 50 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

let cachedSession: http2.ClientHttp2Session | null = null;
let cachedSessionHost: string | null = null;

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

async function getOrOpenSession(): Promise<http2.ClientHttp2Session> {
  const host = getApnsHost();
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
  // /* @vite-ignore */ keeps vite from statically resolving "http2" so it
  // doesn't externalise it for jsdom test environments. Production / Node
  // resolve the import normally at runtime.
  const http2Mod = (await import(/* @vite-ignore */ "http2")) as typeof http2;
  cachedSession = http2Mod.connect(host);
  cachedSessionHost = host;
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

      // 0x8 is NGHTTP2_CANCEL per RFC 7540 §7 — fixed by the HTTP/2 spec,
      // safe to inline so we don't need to load http2.constants here.
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
