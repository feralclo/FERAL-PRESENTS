"use client";

import { useEffect } from "react";
import { HeroSection } from "./HeroSection";
import { EventsSection } from "./EventsSection";
import { AboutSection } from "./AboutSection";
import { ContactSection } from "./ContactSection";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import type { LandingEvent } from "@/types/events";

import "@/styles/landing.css";
import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface LandingPageProps {
  events: LandingEvent[];
}

export function LandingPage({ events }: LandingPageProps) {
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
      content_name: "FERAL PRESENTS — Home",
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
        <div className="announcement-banner">
          <span className="announcement-banner__badge">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="announcement-banner__icon"
            >
              <path
                d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                fill="#ff0033"
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                fill="#0a0a0a"
              />
            </svg>
            VERIFIED
          </span>
          <span className="announcement-banner__divider" />
          <span className="announcement-banner__text">
            Official FERAL Ticket Store
          </span>
          <span className="announcement-banner__pulse" />
        </div>
        <Header />
      </header>

      {/* Hero — stays in old BEM CSS, outside data-theme wrapper */}
      <HeroSection />

      {/* Everything below hero: Midnight Tailwind theme */}
      <div data-theme="midnight">
        <EventsSection events={events} />
        <AboutSection />
        <ContactSection />
        <MidnightFooter />
      </div>
    </>
  );
}
