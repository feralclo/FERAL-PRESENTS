import { fetchSettings } from "@/lib/settings";
import { TABLES, ORG_ID, SETTINGS_KEYS, brandingKey } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveTemplate } from "@/lib/themes";
import { SettingsProvider } from "@/hooks/useSettings";
import { ThemeEditorBridge } from "@/components/event/ThemeEditorBridge";
import type { BrandingSettings } from "@/types/settings";
import type { MarketingSettings } from "@/types/marketing";
import type { ReactNode } from "react";
import "@/styles/event.css";

/** Always fetch fresh data — admin changes must appear immediately */
export const dynamic = "force-dynamic";

/**
 * Event layout — Server Component that fetches settings before render.
 * Reads theme/image data from the events table.
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
  let settingsKey = `feral_event_${slug}`;
  let eventTheme: string | null = null;
  let eventHasImage = false;
  let eventId: string | null = null;
  let heroImageUrl: string | null = null;

  // Single Supabase client, reused across all queries
  const supabase = await getSupabaseAdmin();

  // STEP 1: Fetch event from DB
  if (supabase) {
    try {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("id, settings_key, theme, cover_image, hero_image")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (event?.settings_key) settingsKey = event.settings_key;
      if (event) {
        eventId = event.id;
        eventTheme = event.theme || null;
        eventHasImage = !!(event.hero_image || event.cover_image);
        heroImageUrl = event.hero_image || event.cover_image || null;
      }
    } catch {
      // Fall through — event may not exist in DB (e.g. Kompass)
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

  // Fetch marketing settings for pixel injection — uses the same admin client
  // as all other layout queries (not the separate anon-key fetch which was flaky)
  const marketingPromise: Promise<MarketingSettings | null> = supabase
    ? Promise.resolve(
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", SETTINGS_KEYS.MARKETING)
          .single()
      )
        .then(({ data }) => (data?.data as MarketingSettings) || null)
        .catch(() => null)
    : Promise.resolve(null);

  // Wait for all in parallel
  const [settings, , branding, activeTemplate, marketing] = await Promise.all([settingsPromise, mediaPromise, brandingPromise, templatePromise, marketingPromise]);

  // Meta Pixel ID — only inject if tracking is enabled
  const pixelId = marketing?.meta_tracking_enabled ? marketing.meta_pixel_id : null;

  // Theme is always from the events table
  const theme = eventTheme || "default";
  const isMinimal = theme === "minimal";

  // Check if cover image exists in DB or media store
  const hasCoverImage = isMinimal && eventHasImage;

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

  const dataThemeAttr = activeTemplate || "midnight";

  /* Preconnect hints — browser starts DNS + TCP/TLS handshake before
     any JS loads, shaving ~100-300ms off Express Checkout readiness.
     Stripe domains for payment processing, Google domains for Google Pay. */
  /* Hero image preload — CSS background-image is discovered late (after
     CSS parse) and loads with low priority. Preloading via <link> in the
     initial HTML starts the fetch immediately, before any JS runs. */
  const preconnectHints = (
    <>
      {heroImageUrl && (
        <link rel="preload" as="image" href={heroImageUrl} fetchPriority="high" />
      )}
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <link rel="preconnect" href="https://pay.google.com" />
      <link rel="dns-prefetch" href="https://pay.google.com" />
      <link rel="dns-prefetch" href="https://www.googleapis.com" />
    </>
  );

  return (
    <>
      {preconnectHints}
      {/* Meta Pixel — raw script tag, server-rendered directly into the HTML.
          NOT using Next.js <Script> component because afterInteractive injects
          client-side (after hydration), which is too late for Pixel Helper detection.
          This raw tag is in the initial HTML response, just like Shopify does it. */}
      {pixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');var pvId='pv-'+Date.now()+'-'+Math.random().toString(36).substr(2,9);fbq('track','PageView',{},{eventID:pvId});window.__META_HTML_PAGEVIEW_ID=pvId;`,
          }}
        />
      )}
      {pixelId && (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      )}
      <div
        data-theme-root
        data-theme={dataThemeAttr}
        className={themeClasses || undefined}
        style={cssVars as React.CSSProperties}
      >
        <ThemeEditorBridge />
        <SettingsProvider settingsKey={settingsKey} initialSettings={settings}>
          {children}
        </SettingsProvider>
      </div>
    </>
  );
}
