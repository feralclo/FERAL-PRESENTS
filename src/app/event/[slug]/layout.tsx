import { fetchSettings } from "@/lib/settings";
import { SETTINGS_KEYS, TABLES, ORG_ID, brandingKey } from "@/lib/constants";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getActiveTemplate } from "@/lib/themes";
import { SettingsProvider } from "@/hooks/useSettings";
import { ThemeEditorBridge } from "@/components/event/ThemeEditorBridge";
import type { BrandingSettings } from "@/types/settings";
import type { ReactNode } from "react";
import "@/styles/event.css";

/** Always fetch fresh data — admin changes must appear immediately */
export const dynamic = "force-dynamic";

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

  // Determine initial values
  let settingsKey = SLUG_TO_SETTINGS_KEY[slug] || `feral_event_${slug}`;
  let eventTheme: string | null = null;
  let eventHasImage = false;
  let eventId: string | null = null;
  let isWeeZTix = slug in SLUG_TO_SETTINGS_KEY;

  // Single Supabase client, reused across all queries
  const supabase = await getSupabaseServer();

  // STEP 1: Fetch event from DB
  if (supabase) {
    try {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("id, settings_key, theme, cover_image, hero_image, payment_method")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (event?.settings_key) settingsKey = event.settings_key;
      if (event) {
        eventId = event.id;
        eventTheme = event.theme || null;
        if (event.payment_method === "weeztix") isWeeZTix = true;
        eventHasImage = !!(event.hero_image || event.cover_image);
      }
    } catch {
      // Fall through to hardcoded map
    }
  }

  // STEP 2: Run settings fetch + media check + branding fetch IN PARALLEL
  const settingsPromise = fetchSettings(settingsKey);

  const mediaPromise =
    !eventHasImage && eventId && supabase
      ? Promise.resolve(
          supabase
            .from(TABLES.SITE_SETTINGS)
            .select("key")
            .in("key", [
              `media_event_${eventId}_banner`,
              `media_event_${eventId}_cover`,
            ])
        )
          .then(({ data }) => {
            if (data && data.length > 0) eventHasImage = true;
          })
          .catch(() => {})
      : Promise.resolve();

  // Fetch org branding for CSS variable injection (server-side, no FOUC)
  const brandingPromise: Promise<BrandingSettings | null> = supabase
    ? Promise.resolve(
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(ORG_ID))
          .single()
      )
        .then(({ data }) => (data?.data as BrandingSettings) || null)
        .catch(() => null)
    : Promise.resolve(null);

  // Fetch active template in parallel (for Aurora detection)
  const templatePromise = getActiveTemplate();

  // Wait for all in parallel
  const [settings, , branding, activeTemplate] = await Promise.all([settingsPromise, mediaPromise, brandingPromise, templatePromise]);

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

  // Inject org branding as CSS variables — enables white-labeling per tenant.
  // These override the defaults in base.css :root, so every component picks them up.
  if (branding?.accent_color) cssVars["--accent"] = branding.accent_color;
  if (branding?.background_color) cssVars["--bg-dark"] = branding.background_color;
  if (branding?.card_color) cssVars["--card-bg"] = branding.card_color;
  if (branding?.text_color) cssVars["--text-primary"] = branding.text_color;
  if (branding?.heading_font) cssVars["--font-mono"] = `'${branding.heading_font}', monospace`;
  if (branding?.body_font) cssVars["--font-sans"] = `'${branding.body_font}', sans-serif`;

  const isAurora = activeTemplate === "aurora";
  const isAura = activeTemplate === "aura";

  const dataThemeAttr = isAurora ? "aurora" : isAura ? "aura" : undefined;

  return (
    <div
      data-theme-root
      {...(dataThemeAttr ? { "data-theme": dataThemeAttr } : {})}
      className={themeClasses || undefined}
      style={cssVars as React.CSSProperties}
    >
      <ThemeEditorBridge />
      <SettingsProvider settingsKey={settingsKey} initialSettings={settings}>
        {children}
      </SettingsProvider>
    </div>
  );
}
