import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/brand/logo — Serves the Entry wordmark as an SVG image.
 * Used in emails where web fonts aren't available.
 *
 * Query params:
 *   ?variant=light  — purple text for light backgrounds (default)
 *   ?variant=dark   — lighter purple for dark backgrounds
 */
export async function GET(request: NextRequest) {
  const variant = request.nextUrl.searchParams.get("variant") || "light";

  // Match the gradient colors from the admin EntryWordmark component
  const gradientColors = variant === "dark"
    ? { start: "#C4B5FD", mid: "#A78BFA", end: "#8B5CF6" }
    : { start: "#A78BFA", mid: "#8B5CF6", end: "#7C3AED" };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="28" viewBox="0 0 120 28">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradientColors.start}"/>
      <stop offset="50%" stop-color="${gradientColors.mid}"/>
      <stop offset="100%" stop-color="${gradientColors.end}"/>
    </linearGradient>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700');
      text { font-family: 'Space Mono', monospace; font-weight: 700; font-size: 15px; letter-spacing: 6px; text-transform: uppercase; }
    </style>
  </defs>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="url(#g)">ENTRY</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
