/**
 * Resolves a quest's org_id from a cascade of signals so the rep-facing
 * pool routes don't 400 on quests that are valid in every other way.
 *
 * Order of authority:
 *   1. The quest row's own `org_id` column (always populated for new
 *      rows since the campaigns feature shipped — defaults to 'feral'
 *      via the column default).
 *   2. The linked event's `org_id` (legacy pre-campaign quests where
 *      the org wasn't always written on the quest itself).
 *   3. The linked promoter's `org_id` (platform / orphan quests with
 *      no event but with a promoter).
 *
 * Returns null only when every link is missing — at which point the
 * quest is genuinely orphaned and the caller should refuse with a
 * `quest_not_anchored` error.
 */
export function resolveQuestOrgId(quest: {
  org_id?: string | null;
  event?: { org_id: string | null } | { org_id: string | null }[] | null;
  promoter?: { org_id: string | null } | { org_id: string | null }[] | null;
}): string | null {
  const fromQuest = (quest.org_id ?? "").trim();
  if (fromQuest) return fromQuest;
  const eventRow = Array.isArray(quest.event)
    ? quest.event[0] ?? null
    : quest.event;
  const fromEvent = (eventRow?.org_id ?? "").trim();
  if (fromEvent) return fromEvent;
  const promoterRow = Array.isArray(quest.promoter)
    ? quest.promoter[0] ?? null
    : quest.promoter;
  const fromPromoter = (promoterRow?.org_id ?? "").trim();
  if (fromPromoter) return fromPromoter;
  return null;
}
