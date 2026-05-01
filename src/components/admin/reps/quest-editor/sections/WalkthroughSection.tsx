"use client";

import type { SectionProps } from "../types";

/**
 * Optional screen recording showing reps how to do the quest. Stores a
 * Mux playback id on `walkthrough_video_url` (column added in Phase 0.1,
 * iOS contract bumped in 0.2). Phase 2.4 wires the upload UX — same
 * shape as the shareable Mux upload, just persisted to a different field.
 */
export function WalkthroughSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
