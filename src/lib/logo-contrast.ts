/**
 * Smart logo contrast helpers.
 *
 * Tenants upload whatever logo they have. Often that means a black wordmark
 * built for white-paper letterheads landing on Entry's dark Midnight surface,
 * where it disappears. Reverse case is rarer but real (white logo on a
 * tenant who's customised their bg to light).
 *
 * We sample a downsized canvas read of the logo image to compute three
 * signals — dominant luminance, colour saturation, and alpha coverage — and
 * recommend an automatic CSS adjustment that makes the logo readable on the
 * surface it's being rendered against without trampling brand-coloured
 * logos (which we leave alone).
 *
 * Pure function, no React imports — unit-testable independently.
 */

export type LogoSurface = "dark" | "light";

export interface LogoAnalysis {
  /** Average luminance of opaque pixels (0–1). */
  luminance: number;
  /** Avg colour saturation (0–1). High = vivid logo, low = monochrome. */
  saturation: number;
  /** Fraction of opaque pixels (0–1). */
  alphaCoverage: number;
}

/** A pragmatic threshold-based recommendation. Returns a CSS filter string. */
export function recommendLogoFilter(
  analysis: LogoAnalysis,
  surface: LogoSurface
): string | null {
  // If the logo barely has any pixels (mostly transparent), leave it alone —
  // it's probably a tightly-cropped icon or PNG with whitespace and there's
  // nothing reliable to invert.
  if (analysis.alphaCoverage < 0.02) return null;

  // Vivid colour logos: never recolour. The brand colour IS the logo.
  if (analysis.saturation > 0.22) return null;

  // Monochrome / nearly-monochrome wordmarks: invert when the logo's
  // luminance fights the surface it's on.
  if (surface === "dark" && analysis.luminance < 0.35) {
    // Dark logo on dark bg → flip to white.
    // brightness(0) collapses every channel to 0, invert(1) flips to white,
    // preserving the alpha mask. Multi-step is what survives PNG transparency.
    return "brightness(0) invert(1)";
  }
  if (surface === "light" && analysis.luminance > 0.7) {
    // White logo on light bg → flip to black.
    return "brightness(0)";
  }
  return null;
}

/**
 * Sample the image at a small canvas size and return luminance / saturation /
 * alpha-coverage statistics. Browser-only — must be called from the client.
 */
export async function analyzeLogo(src: string): Promise<LogoAnalysis | null> {
  if (typeof window === "undefined") return null;
  if (!src) return null;

  return new Promise<LogoAnalysis | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const SAMPLE = 32;
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

        let lumSum = 0;
        let satSum = 0;
        let opaque = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 32) continue;
          opaque++;
          // Rec. 709 luma in 0–1.
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          lumSum += lum;
          // HSL saturation approximation.
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2 / 255;
          const sat =
            max === min
              ? 0
              : l > 0.5
              ? (max - min) / (510 - max - min)
              : (max - min) / (max + min);
          satSum += sat;
        }

        if (opaque === 0) return resolve(null);
        return resolve({
          luminance: lumSum / opaque,
          saturation: satSum / opaque,
          alphaCoverage: opaque / (SAMPLE * SAMPLE),
        });
      } catch {
        return resolve(null);
      }
    };
    img.src = src;
  });
}
