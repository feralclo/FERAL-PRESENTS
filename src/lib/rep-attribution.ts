import { TABLES, ORG_ID } from "@/lib/constants";
import { getSupabaseServer } from "@/lib/supabase/server";
import { awardPoints, getRepSettings } from "@/lib/rep-points";

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

    const supabase = await getSupabaseServer();
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

    // Get program settings for points calculation
    const settings = await getRepSettings(orgId);
    const pointsEarned = settings.points_per_sale * params.ticketCount;

    // 1. Award points
    await awardPoints({
      repId,
      orgId,
      points: pointsEarned,
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
        metadata: { ...currentMeta, rep_id: repId, rep_points_awarded: pointsEarned },
      })
      .eq("id", params.orderId)
      .eq("org_id", orgId);

    // 5. Check milestones (fire-and-forget)
    checkMilestones(repId, orgId, params.eventId).catch(() => {});

    // 6. Send sale notification email (fire-and-forget)
    sendRepSaleNotification(repId, orgId, params).catch(() => {});

    console.log(
      `[rep-attribution] Sale attributed to rep ${repId}: ${params.ticketCount} tickets, ${pointsEarned} points`
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
  const supabase = await getSupabaseServer();
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

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
