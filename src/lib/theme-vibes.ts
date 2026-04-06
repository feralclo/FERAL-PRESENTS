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
    id: "rose-glow",
    name: "Rose Glow",
    description: "Soft pink sparkle — glam, Y2K meets festival energy",
    mood: "Pink / Sparkle / Soft Glam",
    colors: {
      accent: "#FF69B4",
      background: "#120008",
      card: "#1f0a14",
      text: "#fff0f5",
      border: "#3d1a2a",
    },
    structure: {
      glass_blur: "52px",
      glass_saturation: "180%",
      glass_shadow: "0.5",
      mist_opacity: "0.9",
      bokeh_opacity: "1",
      ember_opacity: "0.8",
      glow_opacity: "1",
      warmth_opacity: "0.7",
      grain_opacity: "0.4",
      mist_speed: "20s",
      bokeh_speed: "25s",
      float_speed: "22s",
      accent_mist: "30%",
      accent_bokeh: "28%",
      accent_glow: "60%",
    },
    preview_gradient: "linear-gradient(135deg, #120008, #2a0a18, #120008)",
    tags: ["Pink", "Sparkle", "Glam"],
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
  {
    id: "electric-blue",
    name: "Electric Blue",
    description: "Deep ocean blue — club nights, tech events, cool energy",
    mood: "Cool / Club / Tech",
    colors: {
      accent: "#3B82F6",
      background: "#050a14",
      card: "#0c1424",
      text: "#f0f6ff",
      border: "#1a2e50",
    },
    structure: {
      glass_blur: "44px",
      glass_saturation: "150%",
      glass_shadow: "0.6",
      mist_opacity: "0.8",
      bokeh_opacity: "0.9",
      ember_opacity: "0.4",
      glow_opacity: "0.8",
      warmth_opacity: "0.3",
      grain_opacity: "0.6",
      mist_speed: "16s",
      bokeh_speed: "28s",
      float_speed: "22s",
      accent_mist: "20%",
      accent_bokeh: "22%",
      accent_glow: "50%",
    },
    preview_gradient: "linear-gradient(135deg, #050a14, #0c1424, #050a14)",
    tags: ["Cool", "Club", "Tech"],
  },
  {
    id: "sunset-gold",
    name: "Sunset Gold",
    description: "Warm amber glow — luxury events, golden hour, VIP energy",
    mood: "Warm / Luxury / Golden",
    colors: {
      accent: "#F59E0B",
      background: "#0f0a04",
      card: "#1a1408",
      text: "#fff8eb",
      border: "#3d2e14",
    },
    structure: {
      glass_blur: "36px",
      glass_saturation: "140%",
      glass_shadow: "0.5",
      mist_opacity: "0.7",
      bokeh_opacity: "0.8",
      ember_opacity: "0.9",
      glow_opacity: "0.8",
      warmth_opacity: "1",
      grain_opacity: "0.5",
      mist_speed: "22s",
      bokeh_speed: "32s",
      float_speed: "26s",
      accent_mist: "18%",
      accent_bokeh: "20%",
      accent_glow: "45%",
    },
    preview_gradient: "linear-gradient(135deg, #0f0a04, #1a1408, #0f0a04)",
    tags: ["Warm", "Luxury", "Golden"],
  },
  {
    id: "crimson-night",
    name: "Crimson Night",
    description: "Bold red intensity — underground, warehouse, raw energy",
    mood: "Bold / Underground / Raw",
    colors: {
      accent: "#EF4444",
      background: "#0d0505",
      card: "#1a0c0c",
      text: "#fff5f5",
      border: "#3d1a1a",
    },
    structure: {
      glass_blur: "42px",
      glass_saturation: "160%",
      glass_shadow: "0.6",
      mist_opacity: "0.9",
      bokeh_opacity: "0.8",
      ember_opacity: "1",
      glow_opacity: "0.9",
      warmth_opacity: "0.8",
      grain_opacity: "0.7",
      mist_speed: "15s",
      bokeh_speed: "24s",
      float_speed: "20s",
      accent_mist: "24%",
      accent_bokeh: "22%",
      accent_glow: "55%",
    },
    preview_gradient: "linear-gradient(135deg, #0d0505, #1a0c0c, #0d0505)",
    tags: ["Bold", "Underground", "Raw"],
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
