/**
 * Temporary client-side ticket ids — let the editor key new tickets in
 * `ticket_group_map` (and any other settings JSONB that references a
 * ticket-type id) before they've been persisted.
 *
 * The flow:
 *   1. The editor adds a new ticket → it gets a `tmp-…` id immediately.
 *   2. UI surfaces (per-card Group dropdown, Release Strategy panel,
 *      tier templates) write `ticket_group_map[tmpId] = groupName`.
 *   3. On save, the API payload strips ids that start with `tmp-` so
 *      the server inserts (rather than fails to update a non-existent id).
 *   4. The save response carries back the real ids in the same
 *      `sort_order` we sent. The editor calls `translateTmpIdsInMap()` to
 *      rewrite group_map (and similar settings) tmp→real, then re-saves
 *      settings once.
 *
 * This is deliberately *not* a UUID — collisions are scoped to one client
 * session (the prefix gates everything) and a counter is enough to keep
 * ids unique within a single editor mount.
 */

export const TMP_ID_PREFIX = "tmp-";

let counter = 0;

/** Generate a new temporary id. Format: `tmp-{ms}-{counter}`. */
export function makeTmpTicketId(): string {
  counter += 1;
  return `${TMP_ID_PREFIX}${Date.now()}-${counter}`;
}

/** True when the id was minted by this module. */
export function isTmpTicketId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(TMP_ID_PREFIX);
}

/**
 * Build a translation map by walking pre-save and post-save ticket lists
 * in lockstep. The matching strategy: same `sort_order` *and* same `name`
 * — robust against insertions/reorders within the same save.
 */
export function buildTmpToRealMap(
  preSave: { id: string; name: string; sort_order: number }[],
  postSave: { id: string; name: string; sort_order: number }[]
): Map<string, string> {
  const out = new Map<string, string>();
  if (preSave.length === 0 || postSave.length === 0) return out;

  // Index post-save tickets by (sort_order, name).
  const lookup = new Map<string, string>();
  for (const tt of postSave) {
    lookup.set(`${tt.sort_order}::${tt.name}`, tt.id);
  }

  for (const pre of preSave) {
    if (!isTmpTicketId(pre.id)) continue;
    const realId = lookup.get(`${pre.sort_order}::${pre.name}`);
    if (realId) out.set(pre.id, realId);
  }
  return out;
}

/**
 * Translate any tmp ids in a `Record<ticketId, value>` to their real ids.
 * Returns a new object — does not mutate. Keys missing from the
 * translation map (real ids that were already saved) pass through.
 */
export function translateTmpIdsInMap<T>(
  map: Record<string, T>,
  tmpToReal: Map<string, string>
): Record<string, T> {
  if (tmpToReal.size === 0) return map;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) {
    out[tmpToReal.get(k) ?? k] = v;
  }
  return out;
}
