import type { TicketTypeRow } from "@/types/events";

/**
 * Ticket visibility utilities for sequential release mode.
 *
 * Sequential groups reveal tickets one-at-a-time: only the first non-sold-out
 * ticket (by sort_order) is shown to buyers. When it sells out, the next one
 * reveals automatically. Pure computed state — no cron or background workers.
 */

const UNGROUPED_KEY = "__ungrouped__";

/** A ticket is sold out when capacity is defined and sold >= capacity. */
function isSoldOut(tt: TicketTypeRow): boolean {
  return tt.capacity != null && tt.capacity > 0 && tt.sold >= tt.capacity;
}

/**
 * Returns only the tickets that should be visible on the public event page,
 * respecting sequential release mode per group.
 *
 * For "all" groups (default): all active tickets are shown.
 * For "sequential" groups: only the first non-sold-out ticket per group is shown.
 * Sold-out tickets in sequential groups are still shown (buyers see them greyed out).
 */
export function getVisibleTickets(
  ticketTypes: TicketTypeRow[],
  groupMap: Record<string, string | null> | undefined,
  releaseMode: Record<string, "all" | "sequential"> | undefined,
): TicketTypeRow[] {
  const active = ticketTypes
    .filter((tt) => tt.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);

  if (!releaseMode) return active;

  const map = groupMap || {};

  // Partition active tickets by group
  const groups = new Map<string, TicketTypeRow[]>();
  for (const tt of active) {
    const groupName = map[tt.id] || UNGROUPED_KEY;
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(tt);
  }

  const visible: TicketTypeRow[] = [];

  for (const [groupName, tickets] of groups) {
    const mode = releaseMode[groupName] || "all";
    if (mode === "all") {
      visible.push(...tickets);
    } else {
      // Sequential: show only the first non-sold-out ticket.
      // Sold-out tickets are omitted — the progression bar (which uses
      // getSequentialGroupTickets) already shows the full roadmap.
      for (const tt of tickets) {
        if (!isSoldOut(tt)) {
          visible.push(tt);
          break;
        }
      }
    }
  }

  // Re-sort by sort_order to maintain consistent display order
  return visible.sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Returns ALL tickets in a sequential group (including hidden ones),
 * for the progression bar to show the full roadmap.
 */
export function getSequentialGroupTickets(
  ticketTypes: TicketTypeRow[],
  groupName: string,
  groupMap: Record<string, string | null> | undefined,
): TicketTypeRow[] {
  const map = groupMap || {};
  const key = groupName || UNGROUPED_KEY;

  return ticketTypes
    .filter((tt) => {
      const ttGroup = map[tt.id] || UNGROUPED_KEY;
      return ttGroup === key && tt.status !== "archived";
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Server-side validation: checks that a ticket is allowed to be purchased
 * under sequential release rules. Returns an error message if not.
 */
export function validateSequentialPurchase(
  ticketType: TicketTypeRow,
  allTicketTypes: TicketTypeRow[],
  groupMap: Record<string, string | null> | undefined,
  releaseMode: Record<string, "all" | "sequential"> | undefined,
): string | null {
  if (!releaseMode) return null;

  const map = groupMap || {};
  const groupName = map[ticketType.id] || UNGROUPED_KEY;
  const mode = releaseMode[groupName];

  if (mode !== "sequential") return null;

  // Get all tickets in this group, sorted by sort_order
  const groupTickets = allTicketTypes
    .filter((tt) => {
      const ttGroup = map[tt.id] || UNGROUPED_KEY;
      return ttGroup === groupName && tt.status === "active";
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  // Check all preceding tickets are sold out
  for (const tt of groupTickets) {
    if (tt.id === ticketType.id) break;
    if (!isSoldOut(tt)) {
      return `"${ticketType.name}" is not yet available. "${tt.name}" must sell out first.`;
    }
  }

  return null;
}
