import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";

/**
 * GET /api/rep-portal/manifest — Dynamic PWA manifest with tenant brand name
 *
 * Public route (no auth) — the browser fetches this automatically.
 * Resolves org_id from the request host to get the tenant's brand name.
 */
export async function GET(request: NextRequest) {
  const orgId = getOrgIdFromRequest(request);

  let brandName = "Entry Reps";
  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data: brandingRow } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `${orgId}_branding`)
        .single();

      const branding = (brandingRow?.data as Record<string, string>) || {};
      if (branding.org_name) {
        brandName = `${branding.org_name} Reps`;
      }
    }
  } catch { /* fallback to default name */ }

  const manifest = {
    name: brandName,
    short_name: brandName,
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
