/**
 * Shared rep portal utility functions.
 * Extracted from sales, points, quests, rewards, and layout pages.
 */

import { TABLES, repsKey } from "@/lib/constants";
import { createRepDiscountCode } from "@/lib/discount-codes";

/**
 * Ensure a rep has a linked customer record. Looks up by (org_id, email),
 * creates one if needed, and sets reps.customer_id. Returns the customerId.
 */
export async function ensureRepCustomer(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  repId: string;
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const { supabase, repId, orgId, email, firstName, lastName } = params;
  const lowerEmail = email.toLowerCase().trim();

  // Check if rep already has a customer_id
  const { data: rep } = await supabase
    .from(TABLES.REPS)
    .select("customer_id")
    .eq("id", repId)
    .eq("org_id", orgId)
    .single();

  if (rep?.customer_id) return rep.customer_id;

  // Look up existing customer by email
  const { data: existing } = await supabase
    .from(TABLES.CUSTOMERS)
    .select("id")
    .eq("org_id", orgId)
    .eq("email", lowerEmail)
    .single();

  let customerId: string;

  if (existing) {
    customerId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from(TABLES.CUSTOMERS)
      .insert({
        org_id: orgId,
        email: lowerEmail,
        first_name: firstName,
        last_name: lastName,
      })
      .select("id")
      .single();

    if (error || !created) {
      throw new Error(`Failed to create customer for rep ${repId}: ${error?.message}`);
    }
    customerId = created.id;
  }

  // Link rep → customer
  await supabase
    .from(TABLES.REPS)
    .update({ customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", repId)
    .eq("org_id", orgId);

  return customerId;
}

/**
 * Relative time formatting — "Just now", "5m ago", "3h ago", "2d ago", or a date.
 * Used by sales timeline, points timeline, and notification center.
 */
export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Compact relative time — "now", "5m", "3h", "2d", or a date.
 * Shorter variant for tight spaces (notification center).
 */
export function formatRelativeTimeCompact(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Currency symbol lookup from ISO code.
 */
export function getCurrencySymbol(currency?: string): string {
  switch (currency?.toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "\u20AC";
    case "GBP": return "\u00A3";
    default: return "\u00A3";
  }
}

// ─── Auto-Assign Rep to Events ───────────────────────────────────────────────

/**
 * Auto-assign a rep to all upcoming/published events they aren't already on.
 * Creates discount codes for each assignment. Checks the auto_assign_events setting.
 * Silently skips events that already have the rep assigned.
 */
export async function autoAssignRepToAllEvents(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  repId: string;
  orgId: string;
  repFirstName: string;
  /** Skip the settings check (used when caller already verified) */
  skipSettingsCheck?: boolean;
}): Promise<{ assigned: number }> {
  const { supabase, repId, orgId, repFirstName, skipSettingsCheck } = params;

  // Check if auto-assign is enabled (unless caller already checked)
  if (!skipSettingsCheck) {
    const { data: settingsRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", repsKey(orgId))
      .single();
    const settings = settingsRow?.data || {};
    // Default to true if not set (matches DEFAULT_REP_PROGRAM_SETTINGS)
    if (settings.auto_assign_events === false) {
      return { assigned: 0 };
    }
  }

  // Get all published/active events for this org
  const { data: events } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name")
    .eq("org_id", orgId)
    .in("status", ["published", "active"]);

  if (!events || events.length === 0) return { assigned: 0 };

  // Get existing assignments for this rep
  const { data: existing } = await supabase
    .from(TABLES.REP_EVENTS)
    .select("event_id")
    .eq("org_id", orgId)
    .eq("rep_id", repId);

  const assignedEventIds = new Set((existing || []).map((e: { event_id: string }) => e.event_id));

  let assigned = 0;
  for (const event of events) {
    if (assignedEventIds.has(event.id)) continue;

    // Check for existing discount
    let discountId: string | null = null;
    const { data: existingDiscount } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id")
      .eq("org_id", orgId)
      .eq("rep_id", repId)
      .contains("applicable_event_ids", [event.id])
      .maybeSingle();

    if (existingDiscount) {
      discountId = existingDiscount.id;
    } else {
      const newDiscount = await createRepDiscountCode({
        repId,
        orgId,
        firstName: repFirstName,
        applicableEventIds: [event.id],
        description: `Rep discount: ${repFirstName} — ${event.name}`,
      });
      if (newDiscount) discountId = newDiscount.id;
    }

    const { error } = await supabase
      .from(TABLES.REP_EVENTS)
      .insert({
        org_id: orgId,
        rep_id: repId,
        event_id: event.id,
        discount_id: discountId,
        sales_count: 0,
        revenue: 0,
      });

    if (!error) assigned++;
  }

  return { assigned };
}

/**
 * Auto-assign all active reps to a single event.
 * Used when a new event is published and auto_assign_events is on.
 */
export async function autoAssignAllRepsToEvent(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  eventId: string;
  eventName: string;
  orgId: string;
}): Promise<{ assigned: number }> {
  const { supabase, eventId, eventName, orgId } = params;

  // Get all active reps
  const { data: reps } = await supabase
    .from(TABLES.REPS)
    .select("id, first_name")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (!reps || reps.length === 0) return { assigned: 0 };

  // Get existing assignments for this event
  const { data: existing } = await supabase
    .from(TABLES.REP_EVENTS)
    .select("rep_id")
    .eq("org_id", orgId)
    .eq("event_id", eventId);

  const assignedRepIds = new Set((existing || []).map((e: { rep_id: string }) => e.rep_id));

  let assigned = 0;
  for (const rep of reps) {
    if (assignedRepIds.has(rep.id)) continue;

    let discountId: string | null = null;
    const { data: existingDiscount } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id")
      .eq("org_id", orgId)
      .eq("rep_id", rep.id)
      .contains("applicable_event_ids", [eventId])
      .maybeSingle();

    if (existingDiscount) {
      discountId = existingDiscount.id;
    } else {
      const newDiscount = await createRepDiscountCode({
        repId: rep.id,
        orgId,
        firstName: rep.first_name,
        applicableEventIds: [eventId],
        description: `Rep discount: ${rep.first_name} — ${eventName}`,
      });
      if (newDiscount) discountId = newDiscount.id;
    }

    const { error } = await supabase
      .from(TABLES.REP_EVENTS)
      .insert({
        org_id: orgId,
        rep_id: rep.id,
        event_id: eventId,
        discount_id: discountId,
        sales_count: 0,
        revenue: 0,
      });

    if (!error) assigned++;
  }

  return { assigned };
}

// ─── Success Sound with Session Limiter ─────────────────────────────────────

let _soundPlayCount = 0;
const MAX_SOUND_PLAYS = 3;

/**
 * Play a layered achievement sound via Web Audio API.
 * Triangle-wave arpeggio with chorus detune + sparkle chord.
 * Becomes a no-op after the 3rd call in a session to avoid annoyance.
 */
export function playSuccessSound(): void {
  if (_soundPlayCount >= MAX_SOUND_PLAYS) return;
  _soundPlayCount++;

  try {
    const ctx = new AudioContext();

    // Ascending arpeggio → sparkle chord (C5 E5 G5 C6 + shimmer E6 G6)
    const tones: { freq: number; time: number; dur: number; vol: number }[] = [
      { freq: 523.25, time: 0, dur: 0.18, vol: 0.11 },       // C5
      { freq: 659.25, time: 0.06, dur: 0.18, vol: 0.12 },    // E5
      { freq: 783.99, time: 0.12, dur: 0.18, vol: 0.13 },    // G5
      { freq: 1046.50, time: 0.18, dur: 0.30, vol: 0.11 },   // C6 (sustain)
      { freq: 1318.51, time: 0.24, dur: 0.40, vol: 0.07 },   // E6 sparkle
      { freq: 1567.98, time: 0.27, dur: 0.35, vol: 0.05 },   // G6 sparkle
    ];

    tones.forEach(({ freq, time, dur, vol }) => {
      const t = ctx.currentTime + time;

      // Main tone — triangle (warm)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);

      // Chorus layer — slightly detuned sine (adds shimmer)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.value = freq * 1.004;
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(vol * 0.35, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
      osc2.start(t);
      osc2.stop(t + dur);
    });

    setTimeout(() => ctx.close(), 2000);
  } catch { /* AudioContext not available — silent fallback */ }
}
