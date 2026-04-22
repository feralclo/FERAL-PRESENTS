/**
 * APNs transport — HTTP/2 provider using Apple's token-based auth (P8 key).
 *
 * Credentials (env vars):
 *   APNS_AUTH_KEY_P8     — raw PEM content of the .p8 file
 *   APNS_KEY_ID          — Key ID from the Apple Developer portal
 *   APNS_TEAM_ID         — Apple Developer Team ID (starts with letter)
 *   APNS_BUNDLE_ID       — app bundle identifier (e.g. events.entry.rep)
 *   APNS_USE_SANDBOX     — 'true' for development endpoint; default production
 *
 * Without all four credential vars, isConfigured() returns false and the
 * fanout skips iOS devices with a warning. Set them in Vercel once the
 * Apple Developer account is wired up.
 */

import type {
  DeviceToken,
  DeliveryResult,
  NotificationPayload,
  PushTransport,
} from "./types";

const APNS_PROD_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.development.push.apple.com";

class ApnsTransport implements PushTransport {
  platform: "ios" = "ios";

  isConfigured(): boolean {
    return Boolean(
      process.env.APNS_AUTH_KEY_P8 &&
        process.env.APNS_KEY_ID &&
        process.env.APNS_TEAM_ID &&
        process.env.APNS_BUNDLE_ID
    );
  }

  async send(
    device: DeviceToken,
    payload: NotificationPayload
  ): Promise<DeliveryResult> {
    const start = Date.now();

    if (!this.isConfigured()) {
      // Credentials missing — fanout will record this as 'skipped' so we can
      // see in notification_deliveries which iOS devices would have been
      // hit once credentials are configured.
      return {
        status: "skipped",
        error_message: "APNS_* env vars not configured",
        transport_response_ms: Date.now() - start,
      };
    }

    // Full APNs implementation intentionally deferred until the Apple
    // Developer credentials are ready. The envelope builder below is the
    // one we'll use when that lands — it demonstrates the aps payload
    // shape, custom data keys, and type/deep_link placement.
    const envelope = buildApnsEnvelope(payload);

    try {
      // TODO: send via undici / fetch with HTTP/2 once APNS_* is set.
      // For now, act as a stub that never actually reaches Apple — so
      // we can't accidentally send garbage pushes before auth is wired.
      return {
        status: "skipped",
        error_message: "APNs transport stubbed — auth implementation pending",
        transport_response_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        status: "failed",
        error_message: err instanceof Error ? err.message : "APNs send error",
        transport_response_ms: Date.now() - start,
      };
    }
  }
}

export const apns: PushTransport = new ApnsTransport();

// ---------------------------------------------------------------------------
// Envelope builder — kept public so tests can assert on shape without
// needing real credentials. This is the contract iOS's native-notification
// extension will parse.
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

export function getApnsHost(): string {
  return process.env.APNS_USE_SANDBOX === "true"
    ? APNS_SANDBOX_HOST
    : APNS_PROD_HOST;
}
