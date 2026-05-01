"use client";

import type { SectionProps } from "../types";

/**
 * The 3:4 in-app card hero. Phase 2.2 wires this to the existing
 * `<CoverImagePicker kind="quest_cover">` so the same library + upload
 * pipeline drives both the start-moment template and the editor.
 */
export function CoverSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
