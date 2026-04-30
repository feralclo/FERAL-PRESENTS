/**
 * Manifest of built-in quest cover templates.
 *
 * Templates are static SVG files in /public/quest-cover-templates/{id}.svg —
 * 3:4 portrait, designed with a darker bottom-third so iOS-overlaid quest
 * titles + XP/EP chips stay legible.
 *
 * To add one: drop the SVG in the public dir, append an entry below. No
 * DB migration needed — templates aren't rows in tenant_media; the picker
 * sets cover_image_url to the template's URL directly.
 */

export type QuestCoverTemplateCategory = "Gradient" | "Geometric" | "Texture" | "Solid";

export interface QuestCoverTemplate {
  id: string;
  name: string;
  category: QuestCoverTemplateCategory;
  /** Public path served by Next.js static asset handler. */
  url: string;
  /** Single representative colour for the picker tile placeholder. */
  swatch: string;
}

const t = (
  id: string,
  name: string,
  category: QuestCoverTemplateCategory,
  swatch: string
): QuestCoverTemplate => ({
  id,
  name,
  category,
  url: `/quest-cover-templates/${id}.svg`,
  swatch,
});

export const QUEST_COVER_TEMPLATES: QuestCoverTemplate[] = [
  t("mesh-violet",  "Violet mesh",   "Gradient",  "#7c3aed"),
  t("mesh-sunset",  "Sunset",        "Gradient",  "#fb923c"),
  t("mesh-ocean",   "Ocean",         "Gradient",  "#22d3ee"),
  t("mesh-forest",  "Forest",        "Gradient",  "#10b981"),
  t("mesh-noir",    "Noir",          "Gradient",  "#27272a"),
  t("mesh-cream",   "Cream",         "Gradient",  "#fbbf24"),
  t("geo-circles",  "Concentric",    "Geometric", "#1e1b4b"),
  t("geo-grid",     "Dot grid",      "Geometric", "#181626"),
  t("geo-stripes",  "Stripes",       "Geometric", "#27272a"),
  t("geo-waves",    "Waves",         "Geometric", "#1e3a8a"),
  t("tex-grain",    "Grain",         "Texture",   "#3f1d63"),
  t("tex-scratch",  "Scratch",       "Texture",   "#1c1917"),
  t("tex-halftone", "Halftone",      "Texture",   "#7c2d12"),
  t("solid-violet", "Solid violet",  "Solid",     "#7c3aed"),
  t("solid-noir",   "Solid noir",    "Solid",     "#0a0a0a"),
  t("solid-wine",   "Solid wine",    "Solid",     "#7f1d1d"),
];

export const QUEST_COVER_TEMPLATE_CATEGORIES: QuestCoverTemplateCategory[] = [
  "Gradient",
  "Geometric",
  "Texture",
  "Solid",
];

export function findQuestCoverTemplateByUrl(
  url: string | null | undefined
): QuestCoverTemplate | null {
  if (!url) return null;
  return QUEST_COVER_TEMPLATES.find((t) => t.url === url) ?? null;
}
