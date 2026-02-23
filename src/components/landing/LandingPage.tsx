"use client";

import { useEffect } from "react";
import { HeroSection } from "./HeroSection";
import { EventsSection } from "./EventsSection";
import { AboutSection } from "./AboutSection";
import { ContactSection } from "./ContactSection";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import type { LandingEvent } from "@/types/events";
import type { HomepageSettings } from "@/types/settings";

import "@/styles/hero-effects.css";
import "@/styles/landing.css";
import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface LandingPageProps {
  events: LandingEvent[];
  heroSettings: HomepageSettings;
}

export function LandingPage({ events, heroSettings }: LandingPageProps) {
  const { push } = useDataLayer();
  const { trackPageView } = useMetaTracking();
  useTraffic();

  // Activate scroll reveal for [data-reveal] elements
  useScrollReveal();
  const headerHidden = useHeaderScroll();

  // Track view_content on mount
  useEffect(() => {
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

      {/* Everything below hero: Midnight Tailwind theme */}
      <div data-theme="midnight" className="overflow-x-hidden">
        <EventsSection events={events} />
        <AboutSection />
        <ContactSection />
        <MidnightFooter />
      </div>
    </>
  );
}
