"use client";

import { useEffect } from "react";
import { HeroSection } from "./HeroSection";
import { EventsSection } from "./EventsSection";
import { AboutSection } from "./AboutSection";
import { ContactSection } from "./ContactSection";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";

export function LandingPage() {
  const { push } = useDataLayer();

  // Activate scroll reveal for [data-reveal] elements (Events, Contact sections)
  useScrollReveal();
  const headerHidden = useHeaderScroll();

  // Track view_content on mount (matches existing inline script)
  useEffect(() => {
    push({
      event: "view_content",
      content_name: "FERAL PRESENTS — Home",
      content_type: "website",
      currency: "GBP",
    });
  }, [push]);

  // Fade-in on load (matches existing main.js page transition)
  useEffect(() => {
    document.body.style.opacity = "0";
    document.body.style.transition = "opacity 0.4s ease";
    requestAnimationFrame(() => {
      document.body.style.opacity = "1";
    });

    function onPageShow() {
      document.body.style.opacity = "1";
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <>
      {/* Navigation */}
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
        <div className="announcement-banner">
          <span className="announcement-banner__shield">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                fill="#fff"
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                fill="#ff0033"
              />
            </svg>
          </span>
          <span className="announcement-banner__verified">
            Official FERAL ticket store
          </span>
        </div>
        <Header />
      </header>

      <HeroSection />
      <EventsSection />
      <AboutSection />
      <ContactSection />

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy">
              &copy; 2026 FERAL PRESENTS. ALL RIGHTS RESERVED.
            </span>
            <span className="footer__status">
              STATUS: <span className="text-red">ONLINE</span>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
