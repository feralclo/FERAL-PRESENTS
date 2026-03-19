import { NextResponse } from "next/server";

/**
 * GET /api/scanner/manifest — PWA manifest for the scanner app.
 * Public (no auth required) so the browser can fetch it before login.
 */
export async function GET() {
  const manifest = {
    name: "Entry Scanner",
    short_name: "Scanner",
    description: "Scan tickets at the door",
    start_url: "/scanner",
    scope: "/scanner",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080c",
    theme_color: "#08080c",
    icons: [
      {
        src: "/scanner-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/scanner-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
