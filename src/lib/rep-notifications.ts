import { TABLES } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToRep, isPushConfigured } from "@/lib/web-push";
import type { RepNotificationType } from "@/types/reps";

/**
 * Create an in-app notification for a rep.
 *
 * Fire-and-forget — never throws. Failures are logged and silently ignored.
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
    if (!supabase) return;

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

    // Send push notification (fire-and-forget, never blocks)
    if (isPushConfigured()) {
      sendPushToRep(params.repId, {
        title: params.title,
        body: params.body,
        url: params.link,
        tag: params.type, // Collapse duplicate notification types
      }).catch((err) => {
        console.warn("[rep-notifications] Push send failed:", err);
      });
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
