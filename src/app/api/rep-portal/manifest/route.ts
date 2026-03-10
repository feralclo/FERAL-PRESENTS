import { NextResponse } from "next/server";

/**
 * GET /api/rep-portal/manifest — Dynamic PWA manifest with tenant brand name
 *
 * Public route (no auth) — the browser fetches this automatically.
 * Resolves org_id from the request host to get the tenant's brand name.
 */
export async function GET() {
  const manifest = {
    name: "ENTRY",
    short_name: "ENTRY",
    description: "Sell tickets, complete quests, climb the leaderboard.",
    start_url: "/rep",
    scope: "/rep",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080c",
    theme_color: "#8B5CF6",
    categories: ["social", "entertainment"],
    icons: [
      {
        src: "/api/rep-portal/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/api/rep-portal/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600", // 1 hour cache
    },
  });
}
