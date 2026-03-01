/**
 * Curated color theme presets for tenant branding.
 *
 * Each preset provides a complete 5-color palette that maps to CSS variables.
 * The accent color cascades into 30+ derived CSS vars in midnight.css
 * (glass borders, hero mist, bokeh, embers, glitch glow, CTA effects)
 * via color-mix(), so changing the accent transforms the ENTIRE visual layer.
 *
 * Glass surfaces (midnight-effects.css) use color-mix() with --color-card
 * and --color-background, so preset card/background colors tint the glass.
 *
 * Presets should feel like completely different UI skins:
 * - Entry Dark: Clean neutral — no color, pure platinum elegance
 * - Electric Rose: Hot pink everywhere — fun, girly, festival energy
 * - Neon Mint: Fresh mint green — energetic, modern, standout
 */

export interface ColorPreset {
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
  preview_gradient: string;
  tags: string[];
}

export const COLOR_PRESETS: ColorPreset[] = [
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
    preview_gradient: "linear-gradient(135deg, #050f0c, #0c1a16, #050f0c)",
    tags: ["Fresh", "Modern", "Energetic"],
  },
];

/** Find a preset by ID */
export function getPresetById(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((p) => p.id === id);
}
