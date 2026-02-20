/**
 * XP-based quest accent colors.
 * Replaces the old 4-tier quest system (Common/Rare/Epic/Legendary)
 * with simple value-based color hints. Rep tiers remain the only tier system.
 */

export interface QuestAccent {
  /** Tailwind text color class for the XP value */
  color: string;
  /** CSS class for optional card border glow (from rep-effects.css) */
  glowClass: string;
  /** Gradient class for submit/CTA buttons */
  ctaGradient: string;
  /** Title color class for detail/fullscreen overlays */
  titleColor: string;
  /** Progress bar fill color */
  progressColor: string;
}

export function getQuestAccent(points: number): QuestAccent {
  if (points >= 500) {
    return {
      color: "text-amber-400",
      glowClass: "rep-quest-glow-high",
      ctaGradient: "bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110",
      titleColor: "rep-gradient-text-gold",
      progressColor: "#F59E0B",
    };
  }
  if (points >= 150) {
    return {
      color: "text-violet-400",
      glowClass: "rep-quest-glow-medium",
      ctaGradient: "bg-gradient-to-r from-purple-500 to-violet-500 hover:brightness-110",
      titleColor: "rep-gradient-text",
      progressColor: "#8B5CF6",
    };
  }
  if (points >= 50) {
    return {
      color: "text-sky-400",
      glowClass: "rep-quest-glow-low",
      ctaGradient: "bg-gradient-to-r from-sky-500 to-blue-500 hover:brightness-110",
      titleColor: "text-[#38BDF8]",
      progressColor: "#38BDF8",
    };
  }
  return {
    color: "text-muted-foreground",
    glowClass: "",
    ctaGradient: "bg-primary hover:brightness-110",
    titleColor: "text-foreground",
    progressColor: "#666680",
  };
}
