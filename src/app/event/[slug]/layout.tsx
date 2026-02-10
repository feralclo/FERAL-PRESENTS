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
  let eventId: string | null = null;
  // WeeZTix events have hardcoded slugs in SLUG_TO_SETTINGS_KEY
  let isWeeZTix = slug in SLUG_TO_SETTINGS_KEY;

  try {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("id, settings_key, theme, cover_image, hero_image, payment_method")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (event?.settings_key) {
        settingsKey = event.settings_key;
      }
      if (event) {
        eventId = event.id;
        eventTheme = event.theme || null;
        if (event.payment_method === "weeztix") isWeeZTix = true;
        // Check if any image exists (banner or tile)
        eventHasImage = !!(event.hero_image || event.cover_image);
      }
    }
  } catch {
    // Fall through to hardcoded map
  }

  // Also check for uploaded media in site_settings (fallback if DB columns
  // don't exist — images are stored separately via upload API)
  if (!eventHasImage && eventId) {
    try {
      const supabase = await getSupabaseServer();
      if (supabase) {
        // Check for banner first, then cover
        const { data: mediaRows } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("key")
          .in("key", [
            `media_event_${eventId}_banner`,
            `media_event_${eventId}_cover`,
          ]);
        if (mediaRows && mediaRows.length > 0) {
          eventHasImage = true;
        }
      }
    } catch {
      // No media found, that's fine
    }
  }

  // Fetch settings server-side — no loading state, no FOUC
  let settings = null;
  try {
    settings = await fetchSettings(settingsKey);
  } catch {
    // Settings fetch failed — render page with defaults
  }

  // Determine theme:
  // - WeeZTix events: site_settings is the authority (legacy system)
  // - Native events: events table is the authority (admin saves theme there)
  const theme = isWeeZTix
    ? (settings?.theme as string) || eventTheme || "default"
    : eventTheme || "default";
  const isMinimal = theme === "minimal";

  // Determine if cover image exists:
  // - WeeZTix events: use minimalBgEnabled flag from site_settings
  // - Native events: check if hero/cover image exists in DB or media store
  const hasCoverImage = isMinimal && (
    isWeeZTix ? !!(settings?.minimalBgEnabled) : eventHasImage
  );

  const themeClasses = [
    isMinimal ? "theme-minimal" : "",
    hasCoverImage ? "has-cover-image" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const cssVars: Record<string, string> = {};
  if (hasCoverImage) {
    // Use site_settings values if available, otherwise subtle defaults
    cssVars["--cover-blur"] = `${settings?.minimalBlurStrength ?? 4}px`;
    cssVars["--static-opacity"] = `${(settings?.minimalStaticStrength ?? 5) / 100}`;
  }

  return (
    <div className={themeClasses || undefined} style={cssVars as React.CSSProperties}>
      <SettingsProvider settingsKey={settingsKey} initialSettings={settings}>
        {children}
      </SettingsProvider>
    </div>
  );
}
