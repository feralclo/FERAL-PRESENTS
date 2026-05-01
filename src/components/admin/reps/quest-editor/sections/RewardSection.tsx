"use client";

import type { SectionProps } from "../types";

/**
 * XP + EP reward inputs. Visible by default (not chipped) — every quest
 * needs a reward. Phase 2.1 fills this in with the compact two-input row
 * + platform-XP prefill via `getPlatformXPConfig()`.
 */
export function RewardSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
