import type { RepQuest } from "@/types/reps";

export interface EventDateLookup {
  id: string;
  date_start: string | null;
}

/**
 * A quest is "past" when its linked event's `date_start` is strictly before now.
 * Quests without a linked event (always-on) are never considered past.
 */
export function isPastQuest(
  quest: RepQuest,
  eventById: Map<string, EventDateLookup>,
  nowMs: number = Date.now()
): boolean {
  if (!quest.event_id) return false;
  const ev = eventById.get(quest.event_id);
  if (!ev?.date_start) return false;
  const t = new Date(ev.date_start).getTime();
  return Number.isFinite(t) && t < nowMs;
}

/**
 * Split quests into Live-&-upcoming vs Past, each sorted sensibly:
 *   • Live: by event date asc, always-on quests sink to the end; ties break
 *     by `created_at` desc (newest first).
 *   • Past: most recently finished first (event date desc).
 */
export function partitionQuestsByEventDate(
  quests: RepQuest[],
  eventById: Map<string, EventDateLookup>,
  nowMs: number = Date.now()
): { live: RepQuest[]; past: RepQuest[] } {
  const live: RepQuest[] = [];
  const past: RepQuest[] = [];
  for (const q of quests) {
    (isPastQuest(q, eventById, nowMs) ? past : live).push(q);
  }

  const eventTime = (q: RepQuest): number => {
    if (!q.event_id) return Number.NaN;
    const d = eventById.get(q.event_id)?.date_start;
    if (!d) return Number.NaN;
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? t : Number.NaN;
  };

  live.sort((a, b) => {
    const aT = eventTime(a);
    const bT = eventTime(b);
    const aVal = Number.isFinite(aT) ? aT : Number.POSITIVE_INFINITY;
    const bVal = Number.isFinite(bT) ? bT : Number.POSITIVE_INFINITY;
    if (aVal !== bVal) return aVal - bVal;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  past.sort((a, b) => {
    const aT = eventTime(a);
    const bT = eventTime(b);
    const aVal = Number.isFinite(aT) ? aT : 0;
    const bVal = Number.isFinite(bT) ? bT : 0;
    return bVal - aVal;
  });

  return { live, past };
}
