/**
 * Midnight theme tier-specific class maps.
 *
 * Centralizes the repeated tier → Tailwind class conditionals
 * used across MidnightTicketCard, MidnightTierProgression, etc.
 */

/** Tier text colors for names / headings */
export const TIER_TEXT_CLASSES: Record<string, string> = {
  platinum: "text-platinum",
  valentine:
    "text-foreground [text-shadow:0_0_15px_rgba(255,126,179,0.4),0_0_30px_rgba(232,54,93,0.2)]",
  black:
    "text-foreground [text-shadow:0_0_20px_rgba(255,255,255,0.4),0_0_40px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]",
  standard: "text-foreground",
};

/** Tier text colors for price display */
export const TIER_PRICE_CLASSES: Record<string, string> = {
  valentine:
    "text-foreground [text-shadow:0_0_10px_rgba(255,126,179,0.3)]",
  black:
    "text-foreground [text-shadow:0_0_10px_rgba(255,255,255,0.3)]",
  standard: "text-foreground",
  platinum: "text-foreground",
};

/** Tier description text colors */
export const TIER_DESC_CLASSES: Record<string, string> = {
  valentine: "text-[rgba(255,200,220,0.7)]",
};
export const TIER_DESC_DEFAULT = "text-muted-foreground";

/** Tier active quantity colors */
export const TIER_QTY_ACTIVE_CLASSES: Record<string, string> = {
  standard: "text-primary",
  platinum: "text-platinum",
  valentine: "text-valentine-pink",
  black: "text-primary",
};

/** Tier +/- button classes */
export const TIER_BUTTON_CLASSES: Record<string, string> = {
  platinum:
    "bg-platinum/10 border-platinum/35 text-platinum hover:bg-platinum/20 hover:border-platinum",
  valentine:
    "bg-valentine/10 border-valentine/40 text-foreground hover:bg-valentine/20 hover:border-valentine-light",
  black:
    "bg-foreground/[0.08] border-foreground/25 text-foreground hover:bg-foreground/15 hover:border-foreground/45",
};

/** Tier "View Merch" badge classes */
export const TIER_MERCH_BADGE_CLASSES: Record<string, string> = {
  platinum:
    "text-platinum border-platinum/40 hover:bg-platinum/15 hover:border-platinum",
  valentine:
    "text-valentine-pink border-valentine/40 hover:bg-valentine/15 hover:border-valentine-light",
  black:
    "text-foreground border-foreground/30 hover:bg-foreground/10 hover:border-foreground/50",
  standard:
    "text-platinum border-platinum/40 hover:bg-platinum/15 hover:border-platinum",
};
