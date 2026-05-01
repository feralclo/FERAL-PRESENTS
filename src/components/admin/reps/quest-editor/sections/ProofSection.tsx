"use client";

import type { SectionProps } from "../types";

/**
 * How reps submit proof. Phase 2.7 renders the segmented control with
 * 5 options (screenshot / url / instagram_link / tiktok_link / text)
 * and updates the chip header summary in real time.
 *
 * Note: `proof_type === "none"` is intentionally absent — iOS has no
 * submission UI for it (renders EmptyView), so creating one would ship
 * a dead-end quest. The admin POST blocks it server-side too.
 */
export function ProofSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
