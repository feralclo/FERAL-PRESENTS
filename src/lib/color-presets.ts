/**
 * Curated color theme presets for tenant branding.
 * Each preset provides a complete 5-color palette that maps to CSS variables.
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
    description: "Deep dark theme designed for nightlife and events",
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
    description: "Vibrant pink palette for festivals and fun events",
    mood: "Pink / Fun / Festival",
    colors: {
      accent: "#E91E8C",
      background: "#110b14",
      card: "#1e1424",
      text: "#f5f0f8",
      border: "#2d2235",
    },
    preview_gradient: "linear-gradient(135deg, #110b14, #1e1424, #110b14)",
    tags: ["Fun", "Festival", "Vibrant"],
  },
  {
    id: "clean-slate",
    name: "Clean Slate",
    description: "Neutral and professional — works for any event type",
    mood: "Neutral / Professional / Universal",
    colors: {
      accent: "#6366F1",
      background: "#0f1117",
      card: "#181b24",
      text: "#e8eaf0",
      border: "#262a35",
    },
    preview_gradient: "linear-gradient(135deg, #0f1117, #181b24, #0f1117)",
    tags: ["Professional", "Minimal", "Universal"],
  },
];

/** Find a preset by ID */
export function getPresetById(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((p) => p.id === id);
}
