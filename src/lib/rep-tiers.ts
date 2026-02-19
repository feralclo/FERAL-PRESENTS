/**
 * Rep tier system — maps level ranges to tier metadata.
 * Used by Dashboard, Profile, Layout, and anywhere tier visuals appear.
 */

export interface RepTier {
  name: string;
  ring: string;
  profileRing: string;
  color: string;
  textColor: string;
  bgColor: string;
}

export function getTierFromLevel(level: number): RepTier {
  if (level >= 9) {
    return {
      name: "Mythic",
      ring: "rep-avatar-ring-mythic",
      profileRing: "rep-profile-ring rep-profile-ring-mythic",
      color: "#F59E0B",
      textColor: "text-warning",
      bgColor: "bg-warning/10",
    };
  }
  if (level >= 7) {
    return {
      name: "Elite",
      ring: "rep-avatar-ring-elite",
      profileRing: "rep-profile-ring rep-profile-ring-elite",
      color: "#8B5CF6",
      textColor: "text-primary",
      bgColor: "bg-primary/10",
    };
  }
  if (level >= 4) {
    return {
      name: "Pro",
      ring: "rep-avatar-ring-pro",
      profileRing: "rep-profile-ring rep-profile-ring-pro",
      color: "#38BDF8",
      textColor: "text-info",
      bgColor: "bg-info/10",
    };
  }
  return {
    name: "Starter",
    ring: "rep-avatar-ring-starter",
    profileRing: "rep-profile-ring rep-profile-ring-starter",
    color: "#94A3B8",
    textColor: "text-muted-foreground",
    bgColor: "bg-muted-foreground/10",
  };
}
