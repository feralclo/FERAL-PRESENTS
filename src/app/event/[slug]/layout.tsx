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
 * First checks the events table for the slug, then falls back to hardcoded map.
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

  // Try to look up event in DB to get settings_key
  let settingsKey = SLUG_TO_SETTINGS_KEY[slug] || `feral_event_${slug}`;

  try {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("settings_key")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (event?.settings_key) {
        settingsKey = event.settings_key;
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

  // Determine theme classes for the wrapper
  const isMinimal = settings?.theme === "minimal";
  const hasCoverImage = isMinimal && settings?.minimalBgEnabled;

  const themeClasses = [
    isMinimal ? "theme-minimal" : "",
    hasCoverImage ? "has-cover-image" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const cssVars: Record<string, string> = {};
  if (hasCoverImage) {
    cssVars["--cover-blur"] = `${settings?.minimalBlurStrength || 0}px`;
    cssVars["--static-opacity"] = `${(settings?.minimalStaticStrength || 50) / 100}`;
  }

  return (
    <div className={themeClasses || undefined} style={cssVars as React.CSSProperties}>
      <SettingsProvider settingsKey={settingsKey} initialSettings={settings}>
        {children}
      </SettingsProvider>
    </div>
  );
}
