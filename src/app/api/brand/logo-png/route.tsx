import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * GET /api/brand/logo-png — Generates a PNG of the Entry wordmark.
 *
 * Stripe Connect Dashboard's Branding uploader silently rejects SVGs that
 * reference web fonts. This endpoint rasterises the wordmark using next/og's
 * edge-runtime image renderer so the platform owner can grab guaranteed-
 * compatible PNGs (icon + logo) with one click.
 *
 * Query params:
 *   ?variant=black  (default) — black on white          (light surfaces)
 *   ?variant=white            — white on black          (dark surfaces)
 *   ?variant=violet           — white on #8B5CF6 brand  (matches Connect header)
 *   ?bg=HEX&fg=HEX            — explicit hex pair, overrides variant
 *   ?size=N                   — square N×N. Clamped 64–1024.
 *   ?width=W&height=H         — explicit rectangle. Clamped 64–2048 each.
 *
 * Common URLs the platform owner will use:
 *   ?size=512                       — square icon for Stripe's "Icon" field
 *   ?width=800&height=200           — wide logo for Stripe's "Logo" field
 *   ?size=512&variant=violet        — violet brand icon to match Connect header
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const variantParam = searchParams.get("variant");
  const bgParam = searchParams.get("bg");
  const fgParam = searchParams.get("fg");

  const sizeParam = parseInt(searchParams.get("size") || "", 10);
  const widthParam = parseInt(searchParams.get("width") || "", 10);
  const heightParam = parseInt(searchParams.get("height") || "", 10);

  const baseSize = clampInt(sizeParam, 64, 1024, 512);
  const width = clampInt(widthParam, 64, 2048, baseSize);
  const height = clampInt(heightParam, 64, 2048, baseSize);

  // "entry" in Helvetica Bold 700 has width ≈ fontSize × 2.55. Bound the
  // fontSize by both width (so the wordmark fits with padding on either side)
  // and height (so ascenders/descenders aren't clipped) — take the smaller.
  // Without this, square outputs render the text wider than the canvas.
  const widthBoundedFontSize = width / 2.8;
  const heightBoundedFontSize = height * 0.6;
  const fontSize = Math.min(widthBoundedFontSize, heightBoundedFontSize);
  const letterSpacing = -(fontSize * 0.03);

  // Explicit bg/fg wins; otherwise pick from named variant; default = black.
  const explicitBg = normaliseHex(bgParam);
  const explicitFg = normaliseHex(fgParam);
  const variantPreset = pickVariant(variantParam);
  const background = explicitBg ?? variantPreset.bg;
  const fill = explicitFg ?? variantPreset.fg;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background,
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 700,
          fontSize,
          color: fill,
          letterSpacing,
        }}
      >
        entry
      </div>
    ),
    { width, height },
  );
}

function clampInt(
  n: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function pickVariant(name: string | null): { bg: string; fg: string } {
  switch (name) {
    case "white":
      return { bg: "#000000", fg: "#FFFFFF" };
    case "violet":
      return { bg: "#8B5CF6", fg: "#FFFFFF" };
    default:
      return { bg: "#FFFFFF", fg: "#000000" };
  }
}

function normaliseHex(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  return `#${trimmed.toUpperCase()}`;
}
