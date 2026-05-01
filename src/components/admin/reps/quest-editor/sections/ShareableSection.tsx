"use client";

import type { SectionProps } from "../types";

/**
 * What reps post — single asset OR pool of assets. Phase 2.3 builds
 * the segmented "Single asset / From a campaign" toggle inside this
 * section. Single uses the inline upload zone with the polished
 * primary-tinted recipe; pool drops in `<QuestPoolPicker>` unchanged.
 */
export function ShareableSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
