/**
 * Web-push transport — adapter over the existing VAPID flow in lib/web-push.ts.
 *
 * Fully functional (VAPID keys are already set up). For new device_tokens
 * rows of platform='web', the token field stores the push subscription
 * endpoint + keys as a JSON string.
 */

import {
  isPushConfigured as isWebPushConfigured,
  sendRawPush,
} from "@/lib/web-push";
import type {
  DeviceToken,
  DeliveryResult,
  NotificationPayload,
  PushTransport,
} from "./types";

class WebPushTransport implements PushTransport {
  platform: "web" = "web";

  isConfigured(): boolean {
    return isWebPushConfigured();
  }

  async send(
    device: DeviceToken,
    payload: NotificationPayload
  ): Promise<DeliveryResult> {
    const start = Date.now();

    if (!this.isConfigured()) {
      return {
        status: "skipped",
        error_message: "VAPID keys not configured",
        transport_response_ms: Date.now() - start,
      };
    }

    // The new device_tokens.token for platform='web' stores the full
    // subscription object (endpoint + keys) as JSON — kept simple so
    // registration is a single opaque string from the client.
    let subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    try {
      subscription = JSON.parse(device.token);
    } catch {
      return {
        status: "invalid_token",
        error_message: "Token is not a parseable subscription JSON",
        transport_response_ms: Date.now() - start,
      };
    }

    try {
      const result = await sendRawPush(subscription, {
        title: payload.title,
        body: payload.body,
        url: payload.deep_link,
        tag: payload.type,
      });
      if (result.ok) {
        return { status: "sent", transport_response_ms: Date.now() - start };
      }
      // 404 / 410 from the push service = subscription gone (user uninstalled
      // PWA, cleared browser data, etc.). Fanout will disable the token.
      if (result.statusCode === 404 || result.statusCode === 410) {
        return {
          status: "invalid_token",
          error_message: `Push service returned ${result.statusCode}`,
          transport_response_ms: Date.now() - start,
        };
      }
      return {
        status: "failed",
        error_message: result.message || `Push service error ${result.statusCode}`,
        transport_response_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        status: "failed",
        error_message: err instanceof Error ? err.message : "web-push send error",
        transport_response_ms: Date.now() - start,
      };
    }
  }
}

export const webPush: PushTransport = new WebPushTransport();
