/**
 * Theme Vibes — Full visual personalities for tenant branding.
 *
 * Each vibe provides a complete 5-color palette PLUS structural parameters
 * (glass blur, animation speed, effect opacity, accent bleed intensity)
 * that transform the entire visual feel — not just tinting.
 *
 * Colors cascade into 30+ derived CSS vars in midnight.css via color-mix().
 * Structural vars cascade into glass, hero effects, and animation timing
 * via var() with fallbacks in midnight.css, midnight-effects.css, and
 * hero-effects.css.
 *
 * Backwards-compatible: `ColorPreset` type alias and `COLOR_PRESETS` export
 * keep existing code working. `getPresetById` still works.
 */

export interface ThemeVibe {
  id: string;
  name: string;
  description: string;
  mood: string;
  colors: {
    accent: string;
    background: string;
    card: string;
    text: string;
    border: string;
  };
  structure: {
    glass_blur: string;
    glass_saturation: string;
    glass_shadow: string;
    mist_opacity: string;
    bokeh_opacity: string;
    ember_opacity: string;
    glow_opacity: string;
    warmth_opacity: string;
    grain_opacity: string;
    mist_speed: string;
    bokeh_speed: string;
    float_speed: string;
    accent_mist: string;
    accent_bokeh: string;
    accent_glow: string;
  };
  preview_gradient: string;
  tags: string[];
}

/** Backwards-compatible alias */
export type ColorPreset = ThemeVibe;

export const THEME_VIBES: ThemeVibe[] = [
  {
    id: "entry-dark",
    name: "Entry Dark",
    description: "Clean minimal dark — no color, pure elegance",
    mood: "Minimal / Platinum",
    colors: {
      accent: "#ffffff",
      background: "#0a0a0a",
      card: "#141414",
      text: "#ffffff",
      border: "#222222",
    },
    structure: {
      glass_blur: "20px",
      glass_saturation: "110%",
      glass_shadow: "0.3",
      mist_opacity: "0.15",
      bokeh_opacity: "0.15",
      ember_opacity: "0",
      glow_opacity: "0.1",
      warmth_opacity: "0.1",
      grain_opacity: "0.3",
      mist_speed: "30s",
      bokeh_speed: "50s",
      float_speed: "40s",
      accent_mist: "3%",
      accent_bokeh: "4%",
      accent_glow: "8%",
    },
    preview_gradient: "linear-gradient(135deg, #0a0a0a, #141414, #0a0a0a)",
    tags: ["Minimal", "Dark", "Clean"],
  },
  {
    id: "electric-rose",
    name: "Electric Rose",
    description: "Hot pink energy — festivals, parties, fun vibes",
    mood: "Pink / Fun / Festival",
    colors: {
      accent: "#FF2D8A",
      background: "#0d0009",
      card: "#1a0a12",
      text: "#ffffff",
      border: "#3a1428",
    },
    structure: {
      glass_blur: "48px",
      glass_saturation: "160%",
      glass_shadow: "0.7",
      mist_opacity: "1",
      bokeh_opacity: "1",
      ember_opacity: "1",
      glow_opacity: "1",
      warmth_opacity: "1",
      grain_opacity: "1",
      mist_speed: "14s",
      bokeh_speed: "22s",
      float_speed: "18s",
      accent_mist: "22%",
      accent_bokeh: "22%",
      accent_glow: "55%",
    },
    preview_gradient: "linear-gradient(135deg, #0d0009, #1a0a12, #0d0009)",
    tags: ["Fun", "Festival", "Vibrant"],
  },
  {
    id: "neon-mint",
    name: "Neon Mint",
    description: "Fresh mint green — energetic, modern, standout",
    mood: "Fresh / Energetic / Modern",
    colors: {
      accent: "#00E5A0",
      background: "#050f0c",
      card: "#0c1a16",
      text: "#f0fff8",
      border: "#1a3a30",
    },
    structure: {
      glass_blur: "40px",
      glass_saturation: "140%",
      glass_shadow: "0.5",
      mist_opacity: "0.8",
      bokeh_opacity: "0.7",
      ember_opacity: "0.5",
      glow_opacity: "0.7",
      warmth_opacity: "0.6",
      grain_opacity: "0.8",
      mist_speed: "18s",
      bokeh_speed: "30s",
      float_speed: "25s",
      accent_mist: "14%",
      accent_bokeh: "16%",
      accent_glow: "40%",
    },
    preview_gradient: "linear-gradient(135deg, #050f0c, #0c1a16, #050f0c)",
    tags: ["Fresh", "Modern", "Energetic"],
  },
];

/** Backwards-compatible alias */
export const COLOR_PRESETS = THEME_VIBES;

/** Find a vibe by ID */
export function getVibeById(id: string): ThemeVibe | undefined {
  return THEME_VIBES.find((v) => v.id === id);
}

/** Backwards-compatible alias */
export const getPresetById = getVibeById;

/** Build a CSS variable map from a vibe — includes colors + structural vars */
export function getVibeCssVars(vibe: ThemeVibe): Record<string, string> {
  return {
    "--accent": vibe.colors.accent,
    "--bg-dark": vibe.colors.background,
    "--card-bg": vibe.colors.card,
    "--text-primary": vibe.colors.text,
    "--card-border": vibe.colors.border,
    "--vibe-glass-blur": vibe.structure.glass_blur,
    "--vibe-glass-saturation": vibe.structure.glass_saturation,
    "--vibe-glass-shadow": vibe.structure.glass_shadow,
    "--vibe-mist-opacity": vibe.structure.mist_opacity,
    "--vibe-bokeh-opacity": vibe.structure.bokeh_opacity,
    "--vibe-ember-opacity": vibe.structure.ember_opacity,
    "--vibe-glow-opacity": vibe.structure.glow_opacity,
    "--vibe-warmth-opacity": vibe.structure.warmth_opacity,
    "--vibe-grain-opacity": vibe.structure.grain_opacity,
    "--vibe-mist-speed": vibe.structure.mist_speed,
    "--vibe-bokeh-speed": vibe.structure.bokeh_speed,
    "--vibe-float-speed": vibe.structure.float_speed,
    "--vibe-accent-mist": vibe.structure.accent_mist,
    "--vibe-accent-bokeh": vibe.structure.accent_bokeh,
    "--vibe-accent-glow": vibe.structure.accent_glow,
  };
}
