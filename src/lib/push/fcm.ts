/**
 * FCM transport — Android push via Firebase Cloud Messaging HTTP v1 API.
 *
 * Uses data-only messages so Android clients build the notification
 * locally — consistent tenant theming, no server-side rendering.
 *
 * Credentials (env var):
 *   FCM_SERVICE_ACCOUNT_JSON — full service account JSON (stringified)
 *
 * Without it, isConfigured() returns false and fanout skips Android
 * devices with a warning.
 */

import type {
  DeviceToken,
  DeliveryResult,
  NotificationPayload,
  PushTransport,
} from "./types";

class FcmTransport implements PushTransport {
  platform: "android" = "android";

  isConfigured(): boolean {
    return Boolean(process.env.FCM_SERVICE_ACCOUNT_JSON);
  }

  async send(
    device: DeviceToken,
    payload: NotificationPayload
  ): Promise<DeliveryResult> {
    const start = Date.now();

    if (!this.isConfigured()) {
      return {
        status: "skipped",
        error_message: "FCM_SERVICE_ACCOUNT_JSON not configured",
        transport_response_ms: Date.now() - start,
      };
    }

    const envelope = buildFcmEnvelope(payload, device.token);

    try {
      // TODO: implement the FCM HTTP v1 flow:
      //   1. Parse FCM_SERVICE_ACCOUNT_JSON → private_key + client_email +
      //      project_id.
      //   2. Mint a JWT signed with RS256 and the service account key, audience
      //      https://oauth2.googleapis.com/token, scope
      //      https://www.googleapis.com/auth/firebase.messaging.
      //   3. Exchange for an access token via oauth2.googleapis.com/token.
      //   4. POST to fcm.googleapis.com/v1/projects/{project_id}/messages:send
      //      with Authorization: Bearer {access_token}.
      //   5. Map FCM 404 / UNREGISTERED to invalid_token.
      //
      // Stubbed for now so the fanout structure + delivery logging can land
      // before credentials are available — prevents garbage pushes.
      return {
        status: "skipped",
        error_message: "FCM transport stubbed — auth implementation pending",
        transport_response_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        status: "failed",
        error_message: err instanceof Error ? err.message : "FCM send error",
        transport_response_ms: Date.now() - start,
      };
    }
  }
}

export const fcm: PushTransport = new FcmTransport();

// ---------------------------------------------------------------------------
// Envelope builder — data-only message. Android app constructs the
// notification UI from the data keys, so tenant-themed local rendering
// is consistent with iOS's notification-service-extension approach.
// ---------------------------------------------------------------------------

export function buildFcmEnvelope(
  payload: NotificationPayload,
  token: string
) {
  return {
    message: {
      token,
      data: {
        type: payload.type,
        title: payload.title,
        ...(payload.body ? { body: payload.body } : {}),
        ...(payload.deep_link ? { deep_link: payload.deep_link } : {}),
        ...(payload.data ?? {}),
      },
    },
  };
}
