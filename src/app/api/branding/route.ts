import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID, brandingKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import type { BrandingSettings } from "@/types/settings";

/** Default branding for FERAL — used as fallback when no settings exist */
const DEFAULT_BRANDING: BrandingSettings = {
  org_name: "FERAL PRESENTS",
  logo_url: "/images/FERAL%20LOGO.svg",
  accent_color: "#ff0033",
  background_color: "#0e0e0e",
  card_color: "#1a1a1a",
  text_color: "#ffffff",
  heading_font: "Space Mono",
  body_font: "Inter",
  copyright_text: "FERAL PRESENTS. ALL RIGHTS RESERVED.",
};

/**
 * GET /api/branding — Get org branding settings (public)
 *
 * Returns the branding configuration for the current org.
 * Used by checkout pages, event pages, and email templates
 * to render the correct logo, colors, and text.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: DEFAULT_BRANDING });
    }

    const key = brandingKey(ORG_ID);
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    if (row?.data && typeof row.data === "object") {
      // Merge with defaults so missing fields fall back gracefully
      const branding: BrandingSettings = {
        ...DEFAULT_BRANDING,
        ...(row.data as BrandingSettings),
      };
      return NextResponse.json({ data: branding });
    }

    return NextResponse.json({ data: DEFAULT_BRANDING });
  } catch {
    return NextResponse.json({ data: DEFAULT_BRANDING });
  }
}

/**
 * POST /api/branding — Save org branding settings (admin only)
 *
 * Upserts the branding configuration for the current org.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const key = brandingKey(ORG_ID);

    const { error } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        {
          key,
          data: body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
