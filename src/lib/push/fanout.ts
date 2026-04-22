/**
 * Unified push fanout — takes a single NotificationPayload and pushes it
 * to every registered device for a rep, across iOS / Android / web.
 *
 * Flow:
 *   1. Load every enabled device_tokens row for the rep.
 *   2. Route each device to the matching platform transport (apns / fcm /
 *      webPush).
 *   3. Await all sends in parallel.
 *   4. Write one notification_deliveries row per attempt (including
 *      skipped — so we can see which devices would have fired once APNs
 *      and FCM credentials are configured).
 *   5. Auto-disable devices that returned 'invalid_token' by setting
 *      push_enabled=false, so the next fanout doesn't retry dead tokens.
 *
 * Never throws — the caller (createNotification) is a fire-and-forget
 * side effect, push failures must never break the code path that
 * triggered them.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apns } from "./apns";
import { fcm } from "./fcm";
import { webPush } from "./web";
import type {
  DeviceToken,
  DeliveryResult,
  NotificationPayload,
  PushTransport,
} from "./types";

const transports: Record<DeviceToken["platform"], PushTransport> = {
  ios: apns,
  android: fcm,
  web: webPush,
};

export interface FanoutResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  invalid_tokens_disabled: number;
}

export async function fanoutPush(
  repId: string,
  notificationId: string,
  payload: NotificationPayload
): Promise<FanoutResult> {
  const result: FanoutResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    invalid_tokens_disabled: 0,
  };

  try {
    const db = await getSupabaseAdmin();
    if (!db) return result;

    const { data: devices } = await db
      .from("device_tokens")
      .select("id, rep_id, platform, token, push_enabled")
      .eq("rep_id", repId)
      .eq("push_enabled", true);

    const rows = ((devices ?? []) as DeviceToken[]).filter((d) =>
      transports[d.platform]
    );
    result.attempted = rows.length;
    if (rows.length === 0) return result;

    // Send to all devices in parallel — each transport returns a DeliveryResult
    // rather than throwing, so Promise.all never rejects.
    const results = await Promise.all(
      rows.map(async (device) => ({
        device,
        delivery: await transports[device.platform].send(device, payload),
      }))
    );

    const deliveryRows: Array<{
      notification_id: string;
      device_token_id: string;
      platform: DeviceToken["platform"];
      status: DeliveryResult["status"];
      error_message: string | null;
      transport_response_ms: number;
    }> = [];
    const invalidTokenIds: string[] = [];

    for (const { device, delivery } of results) {
      deliveryRows.push({
        notification_id: notificationId,
        device_token_id: device.id,
        platform: device.platform,
        status: delivery.status,
        error_message: delivery.error_message ?? null,
        transport_response_ms: delivery.transport_response_ms,
      });

      if (delivery.status === "sent") result.sent += 1;
      else if (delivery.status === "failed") result.failed += 1;
      else if (delivery.status === "skipped") result.skipped += 1;
      else if (delivery.status === "invalid_token") {
        result.failed += 1;
        invalidTokenIds.push(device.id);
      }
    }

    // Batch-write all delivery rows
    if (deliveryRows.length > 0) {
      const { error: insertError } = await db
        .from("notification_deliveries")
        .insert(deliveryRows);
      if (insertError) {
        console.error("[push/fanout] Failed to log deliveries:", insertError);
      }
    }

    // Disable dead tokens so we don't retry them next time
    if (invalidTokenIds.length > 0) {
      const { error: disableError } = await db
        .from("device_tokens")
        .update({ push_enabled: false })
        .in("id", invalidTokenIds);
      if (!disableError) {
        result.invalid_tokens_disabled = invalidTokenIds.length;
      }
    }
  } catch (err) {
    console.error("[push/fanout] Unexpected error:", err);
  }

  return result;
}
