import { TABLES } from "@/lib/constants";
import { createOrder } from "@/lib/orders";
import { awardPoints } from "@/lib/rep-points";
import { ensureRepCustomer } from "@/lib/rep-utils";
import type { ClaimMetadata, RewardMetadata, FulfillmentType } from "@/types/reps";

interface FulfillmentParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  orgId: string;
  rep: { id: string; email: string; first_name: string; last_name: string; org_id: string };
  reward: { id: string; name: string; points_cost?: number | null; product_id?: string | null; metadata?: RewardMetadata };
  claimId: string;
  body?: { merch_size?: string };
}

type FulfillmentResult =
  | { metadata: ClaimMetadata }
  | { error: string };

/**
 * Central fulfillment dispatcher. Called after claim_reward_atomic succeeds.
 * For automated types, creates orders/tickets. For manual, does nothing.
 * On failure, cancels the claim and refunds currency.
 */
export async function fulfillRewardClaim(params: FulfillmentParams): Promise<FulfillmentResult> {
  const { supabase, orgId, rep, reward, claimId, body } = params;
  const fulfillmentType: FulfillmentType = reward.metadata?.fulfillment_type || "manual";

  if (fulfillmentType === "manual") {
    return { metadata: {} };
  }

  try {
    switch (fulfillmentType) {
      case "free_ticket":
      case "extra_tickets":
        return await fulfillTicket({ supabase, orgId, rep, reward, claimId });
      case "vip_upgrade":
        return await fulfillVipUpgrade({ supabase, orgId, rep, reward, claimId });
      case "merch":
        return await fulfillMerch({ supabase, orgId, rep, reward, claimId, merchSize: body?.merch_size });
      default:
        return { metadata: {} };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Fulfillment failed";
    await cancelClaimAndRefund({ supabase, orgId, repId: rep.id, claimId, rewardId: reward.id, pointsCost: reward.points_cost || 0, reason });
    return { error: reason };
  }
}

// ─── Free Ticket / Extra Tickets ────────────────────────────────────────────

async function fulfillTicket(params: Omit<FulfillmentParams, "body">): Promise<FulfillmentResult> {
  const { supabase, orgId, rep, reward, claimId } = params;
  const meta = reward.metadata!;

  if (!meta.event_id || !meta.ticket_type_id) {
    throw new Error("Reward missing event_id or ticket_type_id in metadata");
  }

  const customerId = await ensureRepCustomer({
    supabase, repId: rep.id, orgId, email: rep.email,
    firstName: rep.first_name, lastName: rep.last_name,
  });

  // Fetch event
  const { data: event, error: eventErr } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name, slug, currency, venue_name, date_start, doors_time")
    .eq("id", meta.event_id)
    .eq("org_id", orgId)
    .single();

  if (eventErr || !event) throw new Error("Event not found for reward");

  // Create a free order (price will be computed from ticket_type — reward covers it)
  const result = await createOrder({
    supabase,
    orgId,
    event,
    items: [{ ticket_type_id: meta.ticket_type_id, qty: 1 }],
    customer: {
      email: rep.email,
      first_name: rep.first_name,
      last_name: rep.last_name,
    },
    payment: { method: "reward", ref: `REWARD-${claimId}`, totalCharged: 0 },
    sendEmail: true,
  });

  const claimMetadata: ClaimMetadata = {
    order_id: result.order.id,
    order_number: result.order.order_number,
    ticket_codes: result.tickets.map((t) => t.ticket_code),
    event_id: meta.event_id,
  };

  // Auto-fulfill the claim
  await markClaimFulfilled(supabase, orgId, claimId, claimMetadata);

  // Link customer if createOrder created/found one
  if (result.customerId !== customerId) {
    await supabase
      .from(TABLES.REPS)
      .update({ customer_id: result.customerId, updated_at: new Date().toISOString() })
      .eq("id", rep.id)
      .eq("org_id", orgId);
  }

  return { metadata: claimMetadata };
}

// ─── VIP Upgrade ────────────────────────────────────────────────────────────

async function fulfillVipUpgrade(params: Omit<FulfillmentParams, "body">): Promise<FulfillmentResult> {
  const { supabase, orgId, rep, reward, claimId } = params;
  const meta = reward.metadata!;

  if (!meta.event_id || !meta.upgrade_to_ticket_type_id) {
    throw new Error("Reward missing event_id or upgrade_to_ticket_type_id in metadata");
  }

  const customerId = await ensureRepCustomer({
    supabase, repId: rep.id, orgId, email: rep.email,
    firstName: rep.first_name, lastName: rep.last_name,
  });

  // Find existing valid ticket for this customer + event
  const { data: ticket } = await supabase
    .from(TABLES.TICKETS)
    .select("id, ticket_type_id")
    .eq("customer_id", customerId)
    .eq("event_id", meta.event_id)
    .eq("org_id", orgId)
    .is("scanned_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!ticket) {
    throw new Error("No existing ticket found for this event. Purchase a ticket first, then upgrade.");
  }

  const originalTicketTypeId = ticket.ticket_type_id;

  // Update ticket to the upgraded type
  await supabase
    .from(TABLES.TICKETS)
    .update({ ticket_type_id: meta.upgrade_to_ticket_type_id, updated_at: new Date().toISOString() })
    .eq("id", ticket.id)
    .eq("org_id", orgId);

  const claimMetadata: ClaimMetadata = {
    event_id: meta.event_id,
    original_ticket_type_id: originalTicketTypeId,
  };

  await markClaimFulfilled(supabase, orgId, claimId, claimMetadata);

  return { metadata: claimMetadata };
}

// ─── Merch ──────────────────────────────────────────────────────────────────

async function fulfillMerch(params: Omit<FulfillmentParams, "body"> & { merchSize?: string }): Promise<FulfillmentResult> {
  const { supabase, orgId, rep, reward, claimId, merchSize } = params;

  if (!merchSize) {
    throw new Error("Merch size is required");
  }

  // If no product linked, fall back to manual fulfillment (admin handles it)
  if (!reward.product_id) {
    const claimMetadata: ClaimMetadata = { merch_size: merchSize };
    await updateClaimMetadata(supabase, orgId, claimId, claimMetadata);
    return { metadata: claimMetadata };
  }

  await ensureRepCustomer({
    supabase, repId: rep.id, orgId, email: rep.email,
    firstName: rep.first_name, lastName: rep.last_name,
  });

  // Find the rep's next assigned event
  const { data: nextEvent } = await supabase
    .from(TABLES.REP_EVENTS)
    .select("event_id, event:events(id, name, slug, currency, venue_name, date_start, doors_time)")
    .eq("rep_id", rep.id)
    .eq("org_id", orgId)
    .order("event(date_start)", { ascending: true })
    .limit(10);

  // Find the first future event
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const futureAssignment = (nextEvent || []).find((re: any) => {
    const evt = re.event;
    return evt && (!evt.date_start || evt.date_start > now);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = (futureAssignment as any)?.event;

  // No upcoming event or no ticket type linked → fall back to manual
  // Claim stays as "claimed" for admin to fulfill (e.g. ship it or hand at any event)
  if (!event) {
    const claimMetadata: ClaimMetadata = { merch_size: merchSize };
    await updateClaimMetadata(supabase, orgId, claimId, claimMetadata);
    return { metadata: claimMetadata };
  }

  // Find the ticket type linked to this product at the event
  const { data: ticketType } = await supabase
    .from(TABLES.TICKET_TYPES)
    .select("id")
    .eq("product_id", reward.product_id)
    .eq("event_id", event.id)
    .eq("org_id", orgId)
    .limit(1)
    .single();

  if (!ticketType) {
    // Product exists but no ticket type at this event — manual fallback
    const claimMetadata: ClaimMetadata = { merch_size: merchSize, event_id: event.id };
    await updateClaimMetadata(supabase, orgId, claimId, claimMetadata);
    return { metadata: claimMetadata };
  }

  const result = await createOrder({
    supabase,
    orgId,
    event,
    items: [{ ticket_type_id: ticketType.id, qty: 1, merch_size: merchSize }],
    customer: {
      email: rep.email,
      first_name: rep.first_name,
      last_name: rep.last_name,
    },
    payment: { method: "reward", ref: `REWARD-${claimId}`, totalCharged: 0 },
    sendEmail: true,
  });

  const claimMetadata: ClaimMetadata = {
    order_id: result.order.id,
    order_number: result.order.order_number,
    ticket_codes: result.tickets.map((t) => t.ticket_code),
    merch_size: merchSize,
    event_id: event.id,
  };

  await markClaimFulfilled(supabase, orgId, claimId, claimMetadata);

  return { metadata: claimMetadata };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markClaimFulfilled(supabase: any, orgId: string, claimId: string, metadata: ClaimMetadata) {
  await supabase
    .from(TABLES.REP_REWARD_CLAIMS)
    .update({
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      metadata,
    })
    .eq("id", claimId)
    .eq("org_id", orgId);
}

/** Store metadata on a claim without marking it as fulfilled (manual fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateClaimMetadata(supabase: any, orgId: string, claimId: string, metadata: ClaimMetadata) {
  await supabase
    .from(TABLES.REP_REWARD_CLAIMS)
    .update({ metadata })
    .eq("id", claimId)
    .eq("org_id", orgId);
}

async function cancelClaimAndRefund(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  orgId: string;
  repId: string;
  claimId: string;
  rewardId: string;
  pointsCost: number;
  reason: string;
}) {
  const { supabase, orgId, repId, claimId, rewardId, pointsCost, reason } = params;

  // Cancel the claim
  await supabase
    .from(TABLES.REP_REWARD_CLAIMS)
    .update({
      status: "cancelled",
      notes: `Fulfillment failed: ${reason}`,
    })
    .eq("id", claimId)
    .eq("org_id", orgId);

  // Refund the currency via awardPoints (0 XP, +currency)
  await awardPoints({
    repId,
    orgId,
    points: 0,
    currency: pointsCost,
    sourceType: "refund",
    sourceId: claimId,
    description: `Refund: reward fulfillment failed — ${reason}`,
  });

  // Decrement total_claimed on reward
  const { data: currentReward } = await supabase
    .from(TABLES.REP_REWARDS)
    .select("total_claimed")
    .eq("id", rewardId)
    .eq("org_id", orgId)
    .single();

  if (currentReward) {
    await supabase
      .from(TABLES.REP_REWARDS)
      .update({ total_claimed: Math.max(0, currentReward.total_claimed - 1) })
      .eq("id", rewardId)
      .eq("org_id", orgId);
  }
}
