import webPush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  userAgent?: string,
  orgId?: string
): Promise<void> {
  if (!orgId) {
    console.error("[web-push] savePushSubscription called without orgId");
    return;
  }
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    console.error("[web-push] No supabase admin client for saving push subscription");
    return;
  }

  const { error } = await supabase
    .from("rep_push_subscriptions")
    .upsert(
      {
        org_id: orgId,
        rep_id: repId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent || null,
      },
      { onConflict: "rep_id,endpoint" }
    );

  if (error) {
    console.error(`[web-push] Failed to save push subscription for rep=${repId}:`, error);
  } else {
    console.info(`[web-push] Push subscription saved for rep=${repId} endpoint=${subscription.endpoint.slice(0, 60)}...`);
  }
}

/**
 * Remove a push subscription.
 */
export async function removePushSubscription(
  repId: string,
  endpoint: string,
  orgId?: string
): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;
  const query = supabase
    .from("rep_push_subscriptions")
    .delete()
    .eq("rep_id", repId)
    .eq("endpoint", endpoint);
  if (orgId) query.eq("org_id", orgId);
  await query;
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
 * Low-level send to a single push subscription. Used by the unified
 * fanout in lib/push/ which manages its own device_tokens rather than
 * iterating rep_push_subscriptions. Returns a structured result that
 * the fanout can translate into a DeliveryResult without throwing.
 */
export async function sendRawPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload
): Promise<
  | { ok: true }
  | { ok: false; statusCode?: number; message?: string }
> {
  if (!isPushConfigured()) {
    return { ok: false, message: "VAPID keys not configured" };
  }
  try {
    await webPush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 60 * 60 }
    );
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      statusCode: (err as { statusCode?: number })?.statusCode,
      message: (err as { message?: string })?.message || String(err),
    };
  }
}

/**
 * Send a push notification to a specific rep (all their subscriptions).
 */
export async function sendPushToRep(
  repId: string,
  payload: PushPayload,
  orgId?: string
): Promise<{ sent: number; failed: number }> {
  if (!isPushConfigured()) {
    return { sent: 0, failed: 0 };
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) return { sent: 0, failed: 0 };
  const query = supabase
    .from("rep_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("rep_id", repId);
  if (orgId) query.eq("org_id", orgId);
  const { data: subs } = await query;

  if (!subs || subs.length === 0) {
    console.warn(`[web-push] No push subscriptions found for rep=${repId} org=${orgId || "any"}`);
    return { sent: 0, failed: 0 };
  }
  console.info(`[web-push] Found ${subs.length} subscription(s) for rep=${repId}`);

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
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const errMsg = (err as { message?: string })?.message || String(err);
      console.error(`[web-push] Send failed for sub=${sub.id} status=${statusCode}: ${errMsg}`);
      // If subscription is expired/invalid (410 Gone, 404 Not Found), mark for removal
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
  payload: PushPayload,
  orgId?: string
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
      batch.map((id) => sendPushToRep(id, payload, orgId))
    );
    for (const r of results) {
      totalSent += r.sent;
      totalFailed += r.failed;
    }
  }

  return { sent: totalSent, failed: totalFailed };
}
