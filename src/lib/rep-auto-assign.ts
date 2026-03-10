/**
 * Server-only utilities for auto-assigning reps to events.
 * Separated from rep-utils.ts because these import server-only modules
 * (discount-codes → supabase/admin → next/headers).
 */

import { TABLES, repsKey } from "@/lib/constants";
import { getOrCreateRepDiscount } from "@/lib/discount-codes";

/**
 * Auto-assign a rep to all upcoming/published events they aren't already on.
 * Gets or creates a single discount code per rep (based on gamertag).
 * Checks the auto_assign_events setting.
 * Silently skips events that already have the rep assigned.
 */
export async function autoAssignRepToAllEvents(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  repId: string;
  orgId: string;
  repFirstName: string;
  repDisplayName?: string;
  /** Skip the settings check (used when caller already verified) */
  skipSettingsCheck?: boolean;
}): Promise<{ assigned: number }> {
  const { supabase, repId, orgId, repFirstName, repDisplayName, skipSettingsCheck } = params;

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

  // Get all published/active rep-enabled events for this org
  const { data: events } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name")
    .eq("org_id", orgId)
    .eq("rep_enabled", true)
    .in("status", ["published", "active", "live"]);

  if (!events || events.length === 0) return { assigned: 0 };

  // Get existing assignments for this rep
  const { data: existing } = await supabase
    .from(TABLES.REP_EVENTS)
    .select("event_id")
    .eq("org_id", orgId)
    .eq("rep_id", repId);

  const assignedEventIds = new Set((existing || []).map((e: { event_id: string }) => e.event_id));

  // Get unassigned events
  const unassignedEvents = events.filter((e: { id: string }) => !assignedEventIds.has(e.id));
  if (unassignedEvents.length === 0) return { assigned: 0 };

  // Get or create a single discount for this rep (globally unique, works for all events)
  const discount = await getOrCreateRepDiscount({
    repId,
    orgId,
    firstName: repFirstName,
    displayName: repDisplayName,
  });

  let assigned = 0;
  for (const event of unassignedEvents) {
    const { error } = await supabase
      .from(TABLES.REP_EVENTS)
      .insert({
        org_id: orgId,
        rep_id: repId,
        event_id: event.id,
        discount_id: discount?.id || null,
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
  const { supabase, eventId, orgId } = params;

  // Get all active reps
  const { data: reps } = await supabase
    .from(TABLES.REPS)
    .select("id, first_name, display_name")
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

    // Get or create a single discount for this rep
    const discount = await getOrCreateRepDiscount({
      repId: rep.id,
      orgId,
      firstName: rep.first_name,
      displayName: rep.display_name,
    });

    const { error } = await supabase
      .from(TABLES.REP_EVENTS)
      .insert({
        org_id: orgId,
        rep_id: rep.id,
        event_id: eventId,
        discount_id: discount?.id || null,
        sales_count: 0,
        revenue: 0,
      });

    if (!error) assigned++;
  }

  return { assigned };
}
