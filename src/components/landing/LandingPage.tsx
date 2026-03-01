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
import type { HomepageSettings } from "@/types/settings";

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
}

export function LandingPage({ events, heroSettings, orgId, aboutSection }: LandingPageProps) {
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

  return (
    <>
      {/* Navigation */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      {/* Hero — Tailwind layout + hero-effects.css for animations */}
      <HeroSection settings={heroSettings} />

      {/* Theme editor bridge for live preview in admin */}
      <ThemeEditorBridge />

      {/* Everything below hero: Midnight Tailwind theme */}
      <div data-theme="midnight" data-theme-root className="overflow-x-hidden">
        <EventsSection events={events} />
        {orgId === "feral" ? (
          <AboutSection />
        ) : aboutSection && aboutSection.pillars?.length > 0 ? (
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
