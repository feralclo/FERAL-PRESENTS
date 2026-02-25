import { TABLES, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BrandingSettings } from "@/types/settings";
import type { ReactNode } from "react";
import "@/styles/event.css";

export const dynamic = "force-dynamic";

/**
 * Shop layout — Server Component with branding CSS var injection (no FOUC).
 * Reuses the same branding system as event pages for consistent white-labeling.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();

  let branding: BrandingSettings | null = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();
      branding = (data?.data as BrandingSettings) || null;
    } catch {
      // Use defaults
    }
  }

  const cssVars: Record<string, string> = {};
  if (branding?.accent_color) cssVars["--accent"] = branding.accent_color;
  if (branding?.background_color) cssVars["--bg-dark"] = branding.background_color;
  if (branding?.card_color) cssVars["--card-bg"] = branding.card_color;
  if (branding?.text_color) cssVars["--text-primary"] = branding.text_color;
  if (branding?.heading_font) cssVars["--font-mono"] = `'${branding.heading_font}', monospace`;
  if (branding?.body_font) cssVars["--font-sans"] = `'${branding.body_font}', sans-serif`;

  return (
    <div
      data-theme-root
      data-theme="midnight"
      style={cssVars as React.CSSProperties}
    >
      {children}
    </div>
  );
}
