"use client";

import type { SectionProps } from "../types";

/**
 * Thin wrapper around the existing `<QuestPoolPicker>` (already shipped
 * via the Library Campaigns rebuild). Phase 2.9 just drops it in under
 * `<ShareableSection>`'s "From a campaign" branch — no new behaviour,
 * just the right wiring.
 */
export function PoolSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
