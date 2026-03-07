/**
 * Rep tier system — maps levels to tier metadata using platform config.
 * Used by Dashboard, Profile, Layout, and anywhere tier visuals appear.
 *
 * Tiers are configured in the platform XP config. This file provides
 * the visual mapping (CSS classes, colors) for each tier.
 */

import { getTierForLevel, DEFAULT_TIERS } from "@/lib/xp-levels";
import type { TierDefinition } from "@/lib/xp-levels";

export interface RepTier {
  name: string;
  ring: string;
  profileRing: string;
  color: string;
  textColor: string;
  bgColor: string;
}

/**
 * CSS class map for avatar rings.
 * Keys are tier names (lowercase). Falls back to "rookie" styling.
 */
const TIER_RING_MAP: Record<string, { ring: string; profileRing: string }> = {
  rookie:  { ring: "rep-avatar-ring-rookie",  profileRing: "rep-profile-ring rep-profile-ring-rookie" },
  rising:  { ring: "rep-avatar-ring-rising",  profileRing: "rep-profile-ring rep-profile-ring-rising" },
  pro:     { ring: "rep-avatar-ring-pro",     profileRing: "rep-profile-ring rep-profile-ring-pro" },
  veteran: { ring: "rep-avatar-ring-veteran", profileRing: "rep-profile-ring rep-profile-ring-veteran" },
  elite:   { ring: "rep-avatar-ring-elite",   profileRing: "rep-profile-ring rep-profile-ring-elite" },
  legend:  { ring: "rep-avatar-ring-legend",  profileRing: "rep-profile-ring rep-profile-ring-legend" },
  mythic:  { ring: "rep-avatar-ring-mythic",  profileRing: "rep-profile-ring rep-profile-ring-mythic" },
  // Backward compat for old tier names
  starter: { ring: "rep-avatar-ring-rookie",  profileRing: "rep-profile-ring rep-profile-ring-rookie" },
};

/**
 * Get the full RepTier for a level, including CSS classes and colors.
 */
export function getTierFromLevel(level: number, tiers?: TierDefinition[]): RepTier {
  const tier = getTierForLevel(level, tiers || DEFAULT_TIERS);
  const key = tier.name.toLowerCase();
  const ringClasses = TIER_RING_MAP[key] || TIER_RING_MAP.rookie;

  return {
    name: tier.name,
    ring: ringClasses.ring,
    profileRing: ringClasses.profileRing,
    color: tier.color,
    textColor: `text-[${tier.color}]`,
    bgColor: `bg-[${tier.color}]/10`,
  };
}
