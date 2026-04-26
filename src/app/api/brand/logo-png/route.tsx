import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * GET /api/brand/logo-png — Generates a PNG of the Entry wordmark.
 *
 * Built specifically so the platform owner can grab a guaranteed-Stripe-
 * Dashboard-compatible logo file with a single click. Stripe's Branding
 * uploader rejects SVGs that reference web fonts (which our static
 * /public/entry-logo-*.svg files do — Helvetica Neue), so this endpoint
 * rasterises the wordmark using next/og's edge-runtime image renderer.
 *
 * Query params:
 *   ?variant=black  (default) — black wordmark on white background
 *   ?variant=white            — white wordmark on black background
 *   ?size=512       (default) — output dimensions (square). Clamped 64–1024.
 *
 * Defaults are tuned for Stripe Dashboard's branding upload (≥128px, square,
 * solid background, PNG). 512×512 is comfortably above their minimums.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant") === "white" ? "white" : "black";
  const sizeParam = parseInt(searchParams.get("size") || "512", 10);
  const size = Math.min(Math.max(Number.isFinite(sizeParam) ? sizeParam : 512, 64), 1024);

  const fill = variant === "white" ? "#FFFFFF" : "#000000";
  const background = variant === "white" ? "#000000" : "#FFFFFF";

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
          fontFamily: "sans-serif",
          fontWeight: 800,
          fontSize: size * 0.42,
          color: fill,
          letterSpacing: -(size * 0.012),
        }}
      >
        entry
      </div>
    ),
    {
      width: size,
      height: size,
    },
  );
}
