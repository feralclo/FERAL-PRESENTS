import webPush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";

// ─── VAPID Configuration ─────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.NEXT_PUBLIC_SITE_URL
  ? `mailto:noreply@${new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname}`
  : "mailto:noreply@entry.live";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

// ─── Subscription Management ─────────────────────────────────────────────────

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Save or update a push subscription for a rep.
 */
export async function savePushSubscription(
  repId: string,
  subscription: PushSubscriptionData,
  userAgent?: string
): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from("rep_push_subscriptions")
    .upsert(
      {
        org_id: ORG_ID,
        rep_id: repId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent || null,
      },
      { onConflict: "rep_id,endpoint" }
    );
}

/**
 * Remove a push subscription.
 */
export async function removePushSubscription(
  repId: string,
  endpoint: string
): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("rep_push_subscriptions")
    .delete()
    .eq("rep_id", repId)
    .eq("endpoint", endpoint);
}

// ─── Send Push Notifications ─────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  actions?: { action: string; title: string }[];
}

/**
 * Send a push notification to a specific rep (all their subscriptions).
 */
export async function sendPushToRep(
  repId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!isPushConfigured()) {
    return { sent: 0, failed: 0 };
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) return { sent: 0, failed: 0 };
  const { data: subs } = await supabase
    .from("rep_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("rep_id", repId);

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  for (const sub of subs) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webPush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        { TTL: 60 * 60 } // 1 hour TTL
      );
      sent++;

      // Update last_used_at
      await supabase
        .from("rep_push_subscriptions")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", sub.id);
    } catch (err: unknown) {
      failed++;
      // If subscription is expired/invalid (410 Gone, 404 Not Found), mark for removal
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        staleIds.push(sub.id);
      }
    }
  }

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await supabase
      .from("rep_push_subscriptions")
      .delete()
      .in("id", staleIds);
  }

  return { sent, failed };
}

/**
 * Send a push notification to multiple reps.
 */
export async function sendPushToReps(
  repIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  // Send in parallel batches of 10
  const batches: string[][] = [];
  for (let i = 0; i < repIds.length; i += 10) {
    batches.push(repIds.slice(i, i + 10));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((id) => sendPushToRep(id, payload))
    );
    for (const r of results) {
      totalSent += r.sent;
      totalFailed += r.failed;
    }
  }

  return { sent: totalSent, failed: totalFailed };
}
