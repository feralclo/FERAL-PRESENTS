"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { EventCard } from "./EventCard";
import type { ListingEvent } from "@/types/events";
import type { BrandingSettings } from "@/types/settings";

interface EventsListPageProps {
  events: ListingEvent[];
  branding?: BrandingSettings | null;
}

export function EventsListPage({ events, branding }: EventsListPageProps) {
  const { push } = useDataLayer();
  const { trackPageView } = useMetaTracking();
  useTraffic();
  const headerHidden = useHeaderScroll();

  useEffect(() => {
    push({
      event: "view_content",
      content_name: "Events",
      content_type: "listing",
    });
    trackPageView();
  }, [push, trackPageView]);

  // Build CSS vars from branding (same pattern as LandingPage.tsx)
  const cssVars: Record<string, string> = {};
  if (branding?.accent_color) cssVars["--accent"] = branding.accent_color;
  if (branding?.background_color) cssVars["--bg-dark"] = branding.background_color;
  if (branding?.card_color) cssVars["--card-bg"] = branding.card_color;
  if (branding?.text_color) cssVars["--text-primary"] = branding.text_color;
  if (branding?.card_border_color) cssVars["--card-border"] = branding.card_border_color;
  if (branding?.heading_font) cssVars["--font-mono"] = `'${branding.heading_font}', monospace`;
  if (branding?.body_font) cssVars["--font-sans"] = `'${branding.body_font}', sans-serif`;

  const hasBranding = Object.keys(cssVars).length > 0;

  // Inject branding CSS vars into :root so Header (outside data-theme wrapper) gets them
  const rootStyleContent = hasBranding
    ? `:root { ${Object.entries(cssVars).map(([k, v]) => `${k}: ${v}`).join("; ")} }`
    : null;

  // Serialize branding for useBranding() client hydration
  const brandingJson = branding ? JSON.stringify(branding) : null;

  return (
    <>
      {/* Inject branding CSS vars into :root for header (outside data-theme-root) */}
      {rootStyleContent && (
        <style dangerouslySetInnerHTML={{ __html: rootStyleContent }} />
      )}
      {/* Serialize branding for useBranding() client hydration */}
      {brandingJson && (
        <script
          id="__BRANDING_DATA__"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: brandingJson }}
        />
      )}

      {/* Navigation — OUTSIDE data-theme wrapper to avoid midnight CSS resets */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      {/* Themed content */}
      <div
        data-theme="midnight"
        data-theme-root
        className="overflow-x-clip"
        style={hasBranding ? cssVars as React.CSSProperties : undefined}
      >
        <main className="min-h-screen">
          {/* Page header */}
          <div className="pt-32 pb-10 max-md:pt-28 max-md:pb-8 px-6 max-md:px-4">
            <div className="max-w-[1200px] mx-auto">
              <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.25em] uppercase text-primary mb-4 block">
                [ALL EVENTS]
              </span>
              <h1 className="font-[family-name:var(--font-mono)] text-[clamp(32px,5vw,56px)] font-bold tracking-[0.15em] uppercase mb-4">
                Events
              </h1>
              <div className="w-[60px] h-0.5 bg-primary" />
              {events.length > 0 && (
                <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-foreground/40 uppercase mt-3 block">
                  {events.length} Event{events.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Events grid */}
          <div className="px-6 max-md:px-4 pb-20">
            <div className="max-w-[1200px] mx-auto">
              {events.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="font-[family-name:var(--font-mono)] text-sm tracking-[0.08em] text-foreground/30">
                    No upcoming events. Check back soon.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <MidnightFooter />
        </main>
      </div>
    </>
  );
}
