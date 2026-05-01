"use client";

import type { SectionProps } from "../types";

/**
 * Where the rep posts. Only rendered when kind === "post_on_social".
 * Phase 2.5 fills in: sub-toggle (Story/Feed/Make-your-own), platform
 * picker (TikTok/Instagram/Either), reference URL, "uses specific sound"
 * switch (TikTok-only).
 */
export function PlatformSection({ state, onChange }: SectionProps) {
  void state;
  void onChange;
  return null;
}
