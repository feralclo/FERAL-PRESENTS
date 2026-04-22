/**
 * Shared types for the unified push fanout.
 *
 * Single NotificationPayload shape drives iOS (APNs), Android (FCM), and
 * web-push envelopes. Per-platform details are built at transport layer
 * (e.g. APNs aps dict, FCM data-only message).
 */

import type { RepNotificationType } from "@/types/reps";

export type PushPlatform = "ios" | "android" | "web";

export interface NotificationPayload {
  type: RepNotificationType;
  title: string;
  body?: string;
  /** Universal/deep link — "entry://..." for native, full URL for web. */
  deep_link?: string;
  /** Type-specific metadata (quest_id, event_id, etc.). All values are strings. */
  data?: Record<string, string>;
}

export interface DeviceToken {
  id: string;
  rep_id: string;
  platform: PushPlatform;
  token: string;
  push_enabled: boolean;
}

export type DeliveryStatus = "sent" | "failed" | "invalid_token" | "skipped";

export interface DeliveryResult {
  status: DeliveryStatus;
  error_message?: string;
  transport_response_ms: number;
}

export interface PushTransport {
  platform: PushPlatform;
  /** True if credentials are set and the transport will actually send. */
  isConfigured(): boolean;
  send(device: DeviceToken, payload: NotificationPayload): Promise<DeliveryResult>;
}
