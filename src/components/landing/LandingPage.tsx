"use client";

import { useEffect } from "react";
import { HeroSection } from "./HeroSection";
import { EventsSection } from "./EventsSection";
import { AboutSection } from "./AboutSection";
import { GenericAboutSection } from "./GenericAboutSection";
import { ContactSection } from "./ContactSection";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { ThemeEditorBridge, isEditorPreview } from "@/components/event/ThemeEditorBridge";
import type { LandingEvent } from "@/types/events";
import type { HomepageSettings, BrandingSettings } from "@/types/settings";

import "@/styles/hero-effects.css";
import "@/styles/landing.css";
import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface AboutSectionData {
  heading_line1: string;
  heading_line2: string;
  pillars: Array<{ title: string; text: string }>;
  closer: string;
}

interface LandingPageProps {
  events: LandingEvent[];
  heroSettings: HomepageSettings;
  orgId?: string;
  aboutSection?: AboutSectionData;
  branding?: BrandingSettings | null;
}

export function LandingPage({ events, heroSettings, orgId, aboutSection, branding }: LandingPageProps) {
  const { push } = useDataLayer();
  const { trackPageView } = useMetaTracking();
  useTraffic();

  // Activate scroll reveal for [data-reveal] elements
  useScrollReveal();
  const headerHidden = useHeaderScroll();

  // Track view_content on mount (suppress in editor preview)
  useEffect(() => {
    if (isEditorPreview()) return;
    push({
      event: "view_content",
      content_name: "Home",
      content_type: "website",
      currency: "GBP",
    });
    trackPageView();
  }, [push, trackPageView]);

  // Build CSS vars from branding (same pattern as event/[slug]/layout.tsx)
  const cssVars: Record<string, string> = {};
  if (branding?.accent_color) cssVars["--accent"] = branding.accent_color;
  if (branding?.background_color) cssVars["--bg-dark"] = branding.background_color;
  if (branding?.card_color) cssVars["--card-bg"] = branding.card_color;
  if (branding?.text_color) cssVars["--text-primary"] = branding.text_color;
  if (branding?.card_border_color) cssVars["--card-border"] = branding.card_border_color;
  if (branding?.heading_font) cssVars["--font-mono"] = `'${branding.heading_font}', monospace`;
  if (branding?.body_font) cssVars["--font-sans"] = `'${branding.body_font}', sans-serif`;

  const hasBranding = Object.keys(cssVars).length > 0;

  // Build :root override string so header/hero outside data-theme-root get the vars too
  const rootStyleContent = hasBranding
    ? `:root { ${Object.entries(cssVars).map(([k, v]) => `${k}: ${v}`).join("; ")} }`
    : null;

  // Serialize branding for client-side hydration (avoids FOUC for logo/org_name)
  const brandingJson = branding ? JSON.stringify(branding) : null;

  return (
    <>
      {/* Inject branding CSS vars into :root for header/hero (outside data-theme-root) */}
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

      {/* Navigation */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      {/* Hero — Tailwind layout + hero-effects.css for animations */}
      <HeroSection settings={heroSettings} orgId={orgId} />

      {/* Theme editor bridge for live preview in admin */}
      <ThemeEditorBridge />

      {/* Everything below hero: Midnight Tailwind theme */}
      <div data-theme="midnight" data-theme-root className="overflow-x-hidden" style={hasBranding ? cssVars as React.CSSProperties : undefined}>
        <EventsSection events={events} />
        {orgId === "feral" ? (
          <AboutSection />
        ) : aboutSection?.pillars?.some(p => p.title || p.text) ? (
          <GenericAboutSection
            headingLine1={aboutSection.heading_line1}
            headingLine2={aboutSection.heading_line2}
            pillars={aboutSection.pillars}
            closer={aboutSection.closer}
          />
        ) : null}
        <ContactSection />
        <MidnightFooter />
      </div>
    </>
  );
}
