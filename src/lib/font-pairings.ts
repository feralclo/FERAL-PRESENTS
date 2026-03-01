/**
 * Curated font pairing options for tenant branding.
 * Each pairing specifies a heading + body font combo with a Google Fonts URL.
 */

export interface FontPairing {
  id: string;
  name: string;
  heading: string;
  body: string;
  style: string;
  google_fonts_query: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: "tech-mono",
    name: "Tech Mono",
    heading: "Space Mono",
    body: "Inter",
    style: "Original Entry look",
    google_fonts_query: "family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700",
  },
  {
    id: "editorial",
    name: "Editorial",
    heading: "Playfair Display",
    body: "Source Sans 3",
    style: "Luxury / editorial",
    google_fonts_query: "family=Playfair+Display:wght@400;700;900&family=Source+Sans+3:wght@300;400;600;700",
  },
  {
    id: "bold-geometric",
    name: "Bold Geometric",
    heading: "Archivo Black",
    body: "DM Sans",
    style: "Strong / modern",
    google_fonts_query: "family=Archivo+Black&family=DM+Sans:wght@300;400;500;700",
  },
  {
    id: "modern-grotesk",
    name: "Modern Grotesk",
    heading: "Space Grotesk",
    body: "Inter",
    style: "Minimal / trendy",
    google_fonts_query: "family=Space+Grotesk:wght@400;500;700&family=Inter:wght@300;400;500;600;700",
  },
  {
    id: "condensed-power",
    name: "Condensed Power",
    heading: "Oswald",
    body: "Nunito Sans",
    style: "Event poster energy",
    google_fonts_query: "family=Oswald:wght@400;500;700&family=Nunito+Sans:wght@300;400;600;700",
  },
];

/** Build a full Google Fonts URL for a pairing */
export function buildGoogleFontsUrl(pairing: FontPairing): string {
  return `https://fonts.googleapis.com/css2?${pairing.google_fonts_query}&display=swap`;
}

/** Build a Google Fonts URL from heading + body font names */
export function buildGoogleFontsUrlFromNames(heading: string, body: string): string | null {
  // Check if this matches a known pairing
  const match = FONT_PAIRINGS.find(
    (p) => p.heading === heading && p.body === body
  );
  if (match) return buildGoogleFontsUrl(match);

  // Check if either font matches a known pairing's fonts — build a custom URL
  const headingPairing = FONT_PAIRINGS.find((p) => p.heading === heading);
  const bodyPairing = FONT_PAIRINGS.find((p) => p.body === body);

  if (!headingPairing && !bodyPairing) return null;

  // Build custom query from known font queries
  const parts: string[] = [];
  if (headingPairing) {
    const headingQuery = headingPairing.google_fonts_query.split("&").find((q) =>
      q.includes(heading.replace(/ /g, "+"))
    );
    if (headingQuery) parts.push(headingQuery);
  }
  if (bodyPairing) {
    const bodyQuery = bodyPairing.google_fonts_query.split("&").find((q) =>
      q.includes(body.replace(/ /g, "+"))
    );
    if (bodyQuery) parts.push(bodyQuery);
  }

  if (parts.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

/** Find a pairing by ID */
export function getPairingById(id: string): FontPairing | undefined {
  return FONT_PAIRINGS.find((p) => p.id === id);
}

/** Default font pair (Space Mono + Inter) */
export const DEFAULT_HEADING_FONT = "Space Mono";
export const DEFAULT_BODY_FONT = "Inter";
