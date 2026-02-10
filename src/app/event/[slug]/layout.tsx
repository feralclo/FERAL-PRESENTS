import { fetchSettings } from "@/lib/settings";
import { SETTINGS_KEYS, TABLES, ORG_ID } from "@/lib/constants";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SettingsProvider } from "@/hooks/useSettings";
import type { ReactNode } from "react";

/** Map URL slugs to settings keys (fallback for events not in DB) */
const SLUG_TO_SETTINGS_KEY: Record<string, string> = {
  "liverpool-27-march": SETTINGS_KEYS.LIVERPOOL,
  "kompass-klub-7-march": SETTINGS_KEYS.KOMPASS,
};

/**
 * Event layout — Server Component that fetches settings before render.
 * Reads theme/image data from BOTH the events table and site_settings.
 * - WeeZTix events: theme + image config from site_settings (JSONB)
 * - Native events: theme + image data from events table columns
 * This eliminates FOUC by providing settings data in the initial HTML.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Try to look up event in DB to get settings_key, theme, and image info
  let settingsKey = SLUG_TO_SETTINGS_KEY[slug] || `feral_event_${slug}`;
  let eventTheme: string | null = null;
  let eventHasImage = false;

  try {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("settings_key, theme, cover_image")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (event?.settings_key) {
        settingsKey = event.settings_key;
      }
      if (event) {
        eventTheme = event.theme || null;
        eventHasImage = !!(event.cover_image);
      }
    }
  } catch {
    // Fall through to hardcoded map
  }

  // Fetch settings server-side — no loading state, no FOUC
  let settings = null;
  try {
    settings = await fetchSettings(settingsKey);
  } catch {
    // Settings fetch failed — render page with defaults
  }

  // Determine theme: site_settings takes priority (WeeZTix), then events table
  const theme = settings?.theme || eventTheme || "default";
  const isMinimal = theme === "minimal";

  // Determine if cover image exists:
  // - WeeZTix events (have site_settings): use minimalBgEnabled flag
  // - Native events (no site_settings): check events table cover_image
  const hasCoverImage = isMinimal && (
    settings ? !!(settings.minimalBgEnabled) : eventHasImage
  );

  const themeClasses = [
    isMinimal ? "theme-minimal" : "",
    hasCoverImage ? "has-cover-image" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const cssVars: Record<string, string> = {};
  if (hasCoverImage) {
    // Use site_settings values if available, otherwise sensible defaults
    cssVars["--cover-blur"] = `${settings?.minimalBlurStrength ?? 8}px`;
    cssVars["--static-opacity"] = `${(settings?.minimalStaticStrength ?? 40) / 100}`;
  }

  return (
    <div className={themeClasses || undefined} style={cssVars as React.CSSProperties}>
      <SettingsProvider settingsKey={settingsKey} initialSettings={settings}>
        {children}
      </SettingsProvider>
    </div>
  );
}
