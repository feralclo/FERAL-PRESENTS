import { TABLES } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToRep, isPushConfigured } from "@/lib/web-push";
import { fanoutPush } from "@/lib/push/fanout";
import type { RepNotificationType } from "@/types/reps";

/**
 * Create an in-app notification for a rep and push it to every registered
 * device (APNs / FCM / web) in parallel.
 *
 * Two push paths run side by side during the legacy rollout:
 *   1. New unified fanout (lib/push/) — reads device_tokens, supports all
 *      three platforms, writes per-delivery rows to notification_deliveries,
 *      auto-disables dead tokens.
 *   2. Legacy sendPushToRep over the existing rep_push_subscriptions table.
 *      Only fires if the rep has NO device_tokens rows yet — covers reps
 *      who registered pre-Phase-4 and haven't re-registered. Prevents
 *      double-sends.
 *
 * Never throws — the caller (quest approval, reward claim, etc.) is a
 * fire-and-forget side effect path; push failures must never break it.
 */
export async function createNotification(params: {
  repId: string;
  orgId: string;
  type: RepNotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      console.error("[rep-notifications] No supabase admin client");
      return;
    }

    const { data: notification, error } = await supabase
      .from(TABLES.REP_NOTIFICATIONS)
      .insert({
        org_id: params.orgId,
        rep_id: params.repId,
        type: params.type,
        title: params.title,
        body: params.body || null,
        link: params.link || null,
        metadata: params.metadata || {},
      })
      .select("id")
      .single();

    if (error || !notification) {
      console.error("[rep-notifications] Insert failed:", error);
      return;
    }

    // Stringify metadata for APNs/FCM data dicts (JSON primitives only).
    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.metadata ?? {})) {
      if (v == null) continue;
      stringData[k] =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : JSON.stringify(v);
    }

    const fanoutPromise = fanoutPush(params.repId, notification.id, {
      type: params.type,
      title: params.title,
      body: params.body,
      deep_link: params.link,
      data: stringData,
    });

    // Legacy path — only if the rep has no device_tokens rows yet.
    const { count: deviceTokenCount } = await supabase
      .from("device_tokens")
      .select("id", { count: "exact", head: true })
      .eq("rep_id", params.repId);

    let legacyPromise: Promise<void> = Promise.resolve();
    if ((deviceTokenCount ?? 0) === 0 && isPushConfigured()) {
      legacyPromise = sendPushToRep(
        params.repId,
        {
          title: params.title,
          body: params.body,
          url: params.link,
          tag: params.type,
        },
        params.orgId
      ).then(
        (r) =>
          console.info(
            `[rep-notifications] Legacy push rep=${params.repId} type=${params.type}: sent=${r.sent} failed=${r.failed}`
          ),
        (err) => console.error("[rep-notifications] Legacy push error:", err)
      );
    }

    const [fanoutResult] = await Promise.all([fanoutPromise, legacyPromise]);

    console.info(
      `[rep-notifications] rep=${params.repId} type=${params.type} fanout: attempted=${fanoutResult.attempted} sent=${fanoutResult.sent} failed=${fanoutResult.failed} skipped=${fanoutResult.skipped}`
    );
  } catch (err) {
    console.error("[rep-notifications] Failed to create notification:", err);
  }
}

/**
 * Get unread notification count for a rep.
 */
export async function getUnreadCount(
  repId: string,
  orgId: string
): Promise<number> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return 0;

    const { count, error } = await supabase
      .from(TABLES.REP_NOTIFICATIONS)
      .select("id", { count: "exact", head: true })
      .eq("rep_id", repId)
      .eq("org_id", orgId)
      .eq("read", false);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}
