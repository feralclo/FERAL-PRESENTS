/**
 * Pure helpers for the APNs transport — no node:http2 reference, safe to
 * import from any environment (jsdom test runner, edge, server, etc).
 *
 * Split out from `./apns.ts` because vite/vitest unconditionally
 * externalises any module that mentions `http2`, and externalisation in
 * jsdom faults at runtime with "No such built-in module: node:". Tests
 * import the pure functions from here; production code in `./apns.ts`
 * re-exports them so the public API stays intact.
 */

import * as crypto from "crypto";
import type { DeliveryResult, NotificationPayload } from "./types";

const APNS_PROD_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.development.push.apple.com";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Mint an ES256 JWT using the P8 private key. Apple's required provider-token
 * shape: header `{alg:ES256, kid, typ:JWT}`, payload `{iss:teamId, iat}`.
 *
 * `dsaEncoding: 'ieee-p1363'` produces the raw 64-byte (r||s) signature
 * Apple expects, instead of the DER form Node's `crypto.sign` returns by
 * default.
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
  const payload = base64url(JSON.stringify({ iss: opts.teamId, iat: now }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("SHA256", Buffer.from(signingInput), {
    key: opts.keyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export function getApnsHost(): string {
  return process.env.APNS_USE_SANDBOX === "true"
    ? APNS_SANDBOX_HOST
    : APNS_PROD_HOST;
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

/**
 * The `aps`-shaped envelope iOS's native-notification extension parses.
 * Public so tests can assert on shape without needing real credentials.
 */
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
