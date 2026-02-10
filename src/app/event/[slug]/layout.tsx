import { fetchSettings } from "@/lib/settings";
import { SETTINGS_KEYS } from "@/lib/constants";
import { SettingsProvider } from "@/hooks/useSettings";
import type { ReactNode } from "react";

/** Map URL slugs to settings keys */
const SLUG_TO_SETTINGS_KEY: Record<string, string> = {
  "liverpool-27-march": SETTINGS_KEYS.LIVERPOOL,
  "kompass-klub-7-march": SETTINGS_KEYS.KOMPASS,
};

/**
 * Event layout — Server Component that fetches settings before render.
 * This eliminates FOUC by providing settings data in the initial HTML.
 * The SettingsProvider wraps children with the fetched data.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settingsKey = SLUG_TO_SETTINGS_KEY[slug] || `feral_event_${slug}`;

  // Fetch settings server-side — no loading state, no FOUC
  const settings = await fetchSettings(settingsKey);

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
    <div className={themeClasses} style={cssVars as React.CSSProperties}>
      <SettingsProvider settingsKey={settingsKey} initialSettings={settings}>
        {children}
      </SettingsProvider>
    </div>
  );
}
