import { TABLES, ORG_ID } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { awardPoints, getRepSettings, calculateLevel } from "@/lib/rep-points";
import { createNotification } from "@/lib/rep-notifications";

/**
 * Attribute a sale to a rep based on a discount code.
 *
 * Called fire-and-forget after order creation. Checks if the order's discount code
 * belongs to a rep, and if so awards points + updates denormalized stats.
 *
 * This function never throws — failures are logged and silently ignored.
 */
export async function attributeSaleToRep(params: {
  orderId: string;
  orgId?: string;
  eventId: string;
  discountCode?: string | null;
  orderTotal: number;
  ticketCount: number;
}): Promise<void> {
  try {
    if (!params.discountCode) return;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const orgId = params.orgId || ORG_ID;

    // Look up the discount code and check if it belongs to a rep
    const { data: discount } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id, rep_id")
      .eq("org_id", orgId)
      .ilike("code", params.discountCode.trim())
      .single();

    if (!discount?.rep_id) return;

    const repId = discount.rep_id;

    // Verify the rep is active
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("id, status, total_sales, total_revenue")
      .eq("id", repId)
      .eq("org_id", orgId)
      .single();

    if (!rep || rep.status !== "active") return;

    // Get program settings for points + currency calculation
    const settings = await getRepSettings(orgId);
    const pointsEarned = settings.points_per_sale * params.ticketCount;
    const currencyEarned = settings.currency_per_sale * params.ticketCount;

    // 1. Award XP + currency
    await awardPoints({
      repId,
      orgId,
      points: pointsEarned,
      currency: currencyEarned,
      sourceType: "sale",
      sourceId: params.orderId,
      description: `Sale: ${params.ticketCount} ticket${params.ticketCount > 1 ? "s" : ""} (${formatCurrency(params.orderTotal)})`,
    });

    // 2. Update rep's denormalized totals
    await supabase
      .from(TABLES.REPS)
      .update({
        total_sales: (rep.total_sales || 0) + params.ticketCount,
        total_revenue: Number(rep.total_revenue || 0) + params.orderTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", repId)
      .eq("org_id", orgId);

    // 3. Update rep_events denormalized stats (if assignment exists)
    const { data: repEvent } = await supabase
      .from(TABLES.REP_EVENTS)
      .select("id, sales_count, revenue")
      .eq("rep_id", repId)
      .eq("event_id", params.eventId)
      .eq("org_id", orgId)
      .single();

    if (repEvent) {
      await supabase
        .from(TABLES.REP_EVENTS)
        .update({
          sales_count: (repEvent.sales_count || 0) + params.ticketCount,
          revenue: Number(repEvent.revenue || 0) + params.orderTotal,
        })
        .eq("id", repEvent.id)
        .eq("org_id", orgId);
    }

    // 4. Store rep_id in order metadata for easy lookups
    const { data: order } = await supabase
      .from(TABLES.ORDERS)
      .select("metadata")
      .eq("id", params.orderId)
      .eq("org_id", orgId)
      .single();

    const currentMeta = (order?.metadata as Record<string, unknown>) || {};
    await supabase
      .from(TABLES.ORDERS)
      .update({
        metadata: { ...currentMeta, rep_id: repId, rep_points_awarded: pointsEarned, rep_currency_awarded: currencyEarned },
      })
      .eq("id", params.orderId)
      .eq("org_id", orgId);

    // 5. Check milestones (fire-and-forget)
    checkMilestones(repId, orgId, params.eventId).catch(() => {});

    // 6. Send sale notification email (fire-and-forget)
    sendRepSaleNotification(repId, orgId, params).catch(() => {});

    // 7. Create in-app sale notification (fire-and-forget)
    createNotification({
      repId,
      orgId,
      type: "sale_attributed",
      title: "Sale incoming!",
      body: `${params.ticketCount} ticket${params.ticketCount > 1 ? "s" : ""} sold — +${pointsEarned} XP +${currencyEarned} ${settings.currency_name}`,
      link: "/rep/sales",
      metadata: { order_id: params.orderId, ticket_count: params.ticketCount, order_total: params.orderTotal },
    }).catch(() => {});

    console.log(
      `[rep-attribution] Sale attributed to rep ${repId}: ${params.ticketCount} tickets, ${pointsEarned} XP, ${currencyEarned} ${settings.currency_name}`
    );
  } catch (err) {
    // Never throw — attribution failure must not block the order flow
    console.error("[rep-attribution] Failed:", err);
  }
}

/**
 * Check if a rep has hit any milestones after a sale.
 */
async function checkMilestones(
  repId: string,
  orgId: string,
  eventId: string
): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  // Get rep's current stats
  const { data: rep } = await supabase
    .from(TABLES.REPS)
    .select("total_sales, total_revenue, points_balance")
    .eq("id", repId)
    .eq("org_id", orgId)
    .single();

  if (!rep) return;

  // Get all milestones for this org (global + event-specific)
  const { data: milestones } = await supabase
    .from(TABLES.REP_MILESTONES)
    .select("*, reward:rep_rewards(*)")
    .eq("org_id", orgId)
    .or(`event_id.is.null,event_id.eq.${eventId}`);

  if (!milestones) return;

  // Get existing non-cancelled claims to avoid double-awarding
  const { data: existingClaims } = await supabase
    .from(TABLES.REP_REWARD_CLAIMS)
    .select("milestone_id")
    .eq("rep_id", repId)
    .eq("org_id", orgId)
    .eq("claim_type", "milestone")
    .neq("status", "cancelled");

  const claimedMilestoneIds = new Set(
    (existingClaims || []).map((c: { milestone_id: string }) => c.milestone_id)
  );

  for (const milestone of milestones) {
    if (claimedMilestoneIds.has(milestone.id)) continue;

    let achieved = false;
    switch (milestone.milestone_type) {
      case "sales_count":
        achieved = rep.total_sales >= milestone.threshold_value;
        break;
      case "revenue":
        achieved = Number(rep.total_revenue) >= milestone.threshold_value;
        break;
      case "points":
        achieved = rep.points_balance >= milestone.threshold_value;
        break;
    }

    if (achieved) {
      // Auto-claim the milestone reward
      await supabase.from(TABLES.REP_REWARD_CLAIMS).insert({
        org_id: orgId,
        rep_id: repId,
        reward_id: milestone.reward_id,
        claim_type: "milestone",
        milestone_id: milestone.id,
        points_spent: 0,
        status: "claimed",
      });

      // Update total_claimed on the reward
      const reward = milestone.reward;
      if (reward) {
        await supabase
          .from(TABLES.REP_REWARDS)
          .update({ total_claimed: (reward.total_claimed || 0) + 1 })
          .eq("id", reward.id)
          .eq("org_id", orgId);
      }

      // In-app notification for milestone unlock
      createNotification({
        repId,
        orgId,
        type: "reward_unlocked",
        title: "Reward Unlocked!",
        body: `${reward?.name || "Reward"} — ${milestone.title}`,
        link: "/rep/rewards",
        metadata: { reward_id: milestone.reward_id, milestone_id: milestone.id },
      }).catch(() => {});

      console.log(
        `[rep-attribution] Milestone achieved: rep=${repId}, milestone=${milestone.title}`
      );
    }
  }
}

/**
 * Send a sale notification email to a rep. Fire-and-forget.
 */
async function sendRepSaleNotification(
  repId: string,
  orgId: string,
  saleData: { orderTotal: number; ticketCount: number }
): Promise<void> {
  try {
    const { sendRepEmail } = await import("@/lib/rep-emails");
    await sendRepEmail({
      type: "sale_notification",
      repId,
      orgId,
      data: {
        ticket_count: saleData.ticketCount,
        order_total: saleData.orderTotal,
      },
    });
  } catch {
    // Email failure is non-critical
  }
}

/**
 * Reverse rep attribution for a refunded order.
 *
 * Uses the `reverse_rep_attribution` RPC for atomic stat reversal,
 * then recalculates level in TypeScript (since thresholds live in site_settings).
 *
 * Returns { repId, repName, pointsDeducted } or null if no attribution / already reversed.
 * Never throws — failures are logged and silently ignored.
 */
export async function reverseRepAttribution(params: {
  orderId: string;
  orgId?: string;
}): Promise<{
  repId: string;
  repName: string;
  pointsDeducted: number;
} | null> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return null;

    const orgId = params.orgId || ORG_ID;

    // Call the atomic RPC
    const { data, error } = await supabase.rpc("reverse_rep_attribution", {
      p_order_id: params.orderId,
      p_org_id: orgId,
    });

    if (error) {
      console.error("[rep-attribution] RPC error:", error);
      return null;
    }

    const result = data as {
      success?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
      rep_id?: string;
      points_deducted?: number;
      new_balance?: number;
    };

    if (result.skipped || result.error) {
      if (result.error) {
        console.error("[rep-attribution] Reversal failed:", result.error);
      }
      return null;
    }

    if (!result.success || !result.rep_id) return null;

    const repId = result.rep_id;
    const pointsDeducted = result.points_deducted || 0;
    const newBalance = result.new_balance || 0;

    // Recalculate level from new balance (RPC can't do this — thresholds are in site_settings)
    const settings = await getRepSettings(orgId);
    const newLevel = calculateLevel(newBalance, settings.level_thresholds);

    await supabase
      .from(TABLES.REPS)
      .update({ level: newLevel, updated_at: new Date().toISOString() })
      .eq("id", repId)
      .eq("org_id", orgId);

    // Recalculate milestones — cancel any milestone claims that are no longer earned
    recalculateMilestones(repId, orgId).catch(() => {});

    // Get rep name for the response
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("first_name, display_name")
      .eq("id", repId)
      .eq("org_id", orgId)
      .single();

    const repName = rep?.display_name || rep?.first_name || "Unknown";

    console.log(
      `[rep-attribution] Reversed attribution for rep ${repId}: -${pointsDeducted} points`
    );

    return { repId, repName, pointsDeducted };
  } catch (err) {
    console.error("[rep-attribution] reverseRepAttribution failed:", err);
    return null;
  }
}

/**
 * After a refund, check if any milestone-based reward claims should be cancelled
 * because the rep no longer meets the threshold.
 */
async function recalculateMilestones(
  repId: string,
  orgId: string
): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  // Get current rep stats
  const { data: rep } = await supabase
    .from(TABLES.REPS)
    .select("total_sales, total_revenue, points_balance")
    .eq("id", repId)
    .eq("org_id", orgId)
    .single();

  if (!rep) return;

  // Get all milestone claims for this rep that are in "claimed" status (not yet fulfilled)
  const { data: claims } = await supabase
    .from(TABLES.REP_REWARD_CLAIMS)
    .select("id, milestone_id, reward_id")
    .eq("rep_id", repId)
    .eq("org_id", orgId)
    .eq("claim_type", "milestone")
    .eq("status", "claimed");

  if (!claims || claims.length === 0) return;

  const milestoneIds = claims
    .map((c: { milestone_id: string | null }) => c.milestone_id)
    .filter(Boolean) as string[];

  if (milestoneIds.length === 0) return;

  const { data: milestones } = await supabase
    .from(TABLES.REP_MILESTONES)
    .select("id, milestone_type, threshold_value, reward_id")
    .in("id", milestoneIds);

  if (!milestones) return;

  for (const milestone of milestones) {
    let stillAchieved = false;
    switch (milestone.milestone_type) {
      case "sales_count":
        stillAchieved = rep.total_sales >= milestone.threshold_value;
        break;
      case "revenue":
        stillAchieved = Number(rep.total_revenue) >= milestone.threshold_value;
        break;
      case "points":
        stillAchieved = rep.points_balance >= milestone.threshold_value;
        break;
    }

    if (!stillAchieved) {
      // Cancel the claim
      const claim = claims.find(
        (c: { milestone_id: string | null }) => c.milestone_id === milestone.id
      );
      if (claim) {
        await supabase
          .from(TABLES.REP_REWARD_CLAIMS)
          .update({ status: "cancelled", notes: "Auto-cancelled: refund dropped below threshold" })
          .eq("id", claim.id)
          .eq("org_id", orgId);

        // Decrement total_claimed on the reward
        const { data: reward } = await supabase
          .from(TABLES.REP_REWARDS)
          .select("total_claimed")
          .eq("id", milestone.reward_id)
          .eq("org_id", orgId)
          .single();

        if (reward && reward.total_claimed > 0) {
          await supabase
            .from(TABLES.REP_REWARDS)
            .update({ total_claimed: reward.total_claimed - 1 })
            .eq("id", milestone.reward_id)
            .eq("org_id", orgId);
        }
      }
    }
  }
}

/**
 * Look up rep attribution info for an order (for the refund warning UI).
 * Returns rep name + points awarded, or null if no attribution.
 */
export async function getOrderRepAttribution(orderId: string, orgId: string = ORG_ID): Promise<{
  repId: string;
  repName: string;
  pointsAwarded: number;
} | null> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return null;

    const { data: order } = await supabase
      .from(TABLES.ORDERS)
      .select("metadata")
      .eq("id", orderId)
      .eq("org_id", orgId)
      .single();

    if (!order?.metadata) return null;

    const meta = order.metadata as Record<string, unknown>;
    const repId = meta.rep_id as string | undefined;
    if (!repId) return null;

    const pointsAwarded = (meta.rep_points_awarded as number) || 0;

    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("first_name, display_name")
      .eq("id", repId)
      .eq("org_id", orgId)
      .single();

    return {
      repId,
      repName: rep?.display_name || rep?.first_name || "Unknown",
      pointsAwarded,
    };
  } catch {
    return null;
  }
}

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
