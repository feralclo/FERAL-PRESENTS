/**
 * Curated color theme presets for tenant branding.
 *
 * Each preset provides a complete 5-color palette that maps to CSS variables.
 * The accent color cascades into 30+ derived CSS vars in midnight.css
 * (glass borders, hero mist, bokeh, embers, glitch glow, CTA effects)
 * via color-mix(), so changing the accent transforms the ENTIRE visual layer.
 *
 * Presets should feel like completely different UI skins:
 * - Crimson Night: Clean, dark, minimal — the FERAL default
 * - Electric Rose: Hot pink everywhere — fun, girly, festival energy
 * - Clean Slate: Cool indigo — professional, tech, corporate
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
    id: "crimson-night",
    name: "Crimson Night",
    description: "Deep dark with subtle red — the classic nightlife look",
    mood: "Dark / Nightlife",
    colors: {
      accent: "#ff0033",
      background: "#0e0e0e",
      card: "#1a1a1a",
      text: "#ffffff",
      border: "#2a2a2a",
    },
    preview_gradient: "linear-gradient(135deg, #0e0e0e, #1a0a0a, #0e0e0e)",
    tags: ["Dark", "Nightlife", "Events"],
  },
  {
    id: "electric-rose",
    name: "Electric Rose",
    description: "Hot pink energy — festivals, parties, fun vibes",
    mood: "Pink / Fun / Festival",
    colors: {
      accent: "#FF1493",
      background: "#110010",
      card: "#220822",
      text: "#fff0fa",
      border: "#4a1545",
    },
    preview_gradient: "linear-gradient(135deg, #110010, #2a0828, #110010)",
    tags: ["Fun", "Festival", "Vibrant"],
  },
  {
    id: "clean-slate",
    name: "Clean Slate",
    description: "Cool indigo — professional, modern, versatile",
    mood: "Professional / Modern / Universal",
    colors: {
      accent: "#6366F1",
      background: "#0a0a14",
      card: "#13142a",
      text: "#e8eaf6",
      border: "#252850",
    },
    preview_gradient: "linear-gradient(135deg, #0a0a14, #13142a, #0a0a14)",
    tags: ["Professional", "Minimal", "Universal"],
  },
];

/** Find a preset by ID */
export function getPresetById(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((p) => p.id === id);
}
