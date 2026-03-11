import { TABLES } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToRep, isPushConfigured } from "@/lib/web-push";
import type { RepNotificationType } from "@/types/reps";

/**
 * Create an in-app notification for a rep and send a push notification.
 *
 * Never throws — failures are logged.
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

    const { error } = await supabase.from(TABLES.REP_NOTIFICATIONS).insert({
      org_id: params.orgId,
      rep_id: params.repId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
      metadata: params.metadata || {},
    });

    if (error) {
      console.error("[rep-notifications] Insert failed:", error);
      return;
    }

    // Send push notification — await so errors are logged properly
    if (isPushConfigured()) {
      try {
        const result = await sendPushToRep(params.repId, {
          title: params.title,
          body: params.body,
          url: params.link,
          tag: params.type,
        }, params.orgId);
        console.info(`[rep-notifications] Push sent to rep=${params.repId} type=${params.type}: sent=${result.sent} failed=${result.failed}`);
      } catch (err) {
        console.error("[rep-notifications] Push send error:", err);
      }
    } else {
      console.warn("[rep-notifications] Push not configured — VAPID keys missing");
    }
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
