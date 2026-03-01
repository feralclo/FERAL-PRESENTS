"use client";

import { useRef, useCallback, useEffect } from "react";
import { ParticleCanvas } from "./ParticleCanvas";
import { HeroGlitchText } from "./HeroGlitchText";
import type { HomepageSettings } from "@/types/settings";

interface HeroSectionProps {
  settings: HomepageSettings;
}

export function HeroSection({ settings }: HeroSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackerRef = useRef<HTMLDivElement>(null);

  const focalX = settings.hero_focal_x ?? 50;
  const focalY = settings.hero_focal_y ?? 50;

  // Pause all hero CSS animations when scrolled off-screen
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        section.classList.toggle("hero--paused", !entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (trackerRef.current) {
      trackerRef.current.style.left = e.clientX + "px";
      trackerRef.current.style.top = e.clientY + "px";
      trackerRef.current.style.opacity = "0.5";
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.style.opacity = "0";
    }
  }, []);

  const handleCtaClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById("events");
    if (target) {
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY + 60;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background image + atmospheric effects */}
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {settings.hero_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={settings.hero_image_url}
            alt=""
            className="hero__bg-image w-full h-full object-cover block"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
          />
        ) : (
          <div className="w-full h-full bg-[var(--bg-dark,#0e0e0e)]" />
        )}
        {/* Atmospheric mist + bokeh */}
        <div className="hero__bg-mist absolute inset-0 z-[1] pointer-events-none overflow-hidden" />
        {/* Spotlight sweep — concert-style beams crossing the frame */}
        <div className="hero__bg-spotlight absolute inset-0 z-[1] pointer-events-none" />
        {/* Light breathing — warm/cool color shift */}
        <div className="hero__bg-breathe absolute inset-0 z-[1] pointer-events-none" />
        {/* Bottom warmth — stage footlights bleeding up */}
        <div className="hero__bg-warmth absolute inset-0 z-[1] pointer-events-none" />
        {/* Rising embers — tiny warm particles drifting upward */}
        <div className="hero__bg-embers absolute inset-0 z-[1] pointer-events-none" />
        {/* Film grain — subtle texture for cinematic feel */}
        <div className="hero__bg-grain absolute inset-0 z-[1] pointer-events-none opacity-[0.035]" />
        {/* Cinematic vignette */}
        <div className="hero__bg-overlay absolute inset-0 z-[2]" />
      </div>

      {/* Particle canvas — positioned absolutely via .hero__canvas CSS */}
      <ParticleCanvas />

      {/* Content — w-full ensures centering works on all screen sizes */}
      <div className="relative z-[2] w-full text-center px-6">
        <HeroGlitchText
          line1={settings.hero_title_line1 || "UPCOMING"}
          line2={settings.hero_title_line2 || "EVENTS"}
        />
        <a
          href="#events"
          className="hero__cta inline-block relative mt-12 px-12 py-[18px] font-[family-name:var(--font-mono)] text-sm font-bold tracking-[4px] uppercase text-white no-underline bg-transparent border border-[var(--red)] overflow-hidden opacity-0 translate-y-10 cursor-pointer"
          onClick={handleCtaClick}
        >
          <span className="relative z-[2]" data-text={settings.hero_cta_text || "SEE EVENTS"}>
            {settings.hero_cta_text || "SEE EVENTS"}
          </span>
          <span className="hero__cta-glitch absolute inset-0 opacity-0 pointer-events-none" />
          <span className="hero__cta-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] opacity-0 pointer-events-none" />
        </a>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-7 left-0 right-0 mx-auto w-fit z-[2] flex flex-col items-center gap-2 opacity-0 animate-[heroReveal_1s_cubic-bezier(0.16,1,0.3,1)_0.8s_forwards]">
        <div className="w-5 h-8 border-[1.5px] border-white/25 rounded-[10px] relative">
          <div className="hero__scroll-wheel w-0.5 h-1.5 bg-[var(--red)] rounded-sm absolute top-1.5 left-1/2 -translate-x-1/2" />
        </div>
        <span className="font-[family-name:var(--font-mono)] text-[8px] tracking-[3px] pl-[3px] text-white/25 uppercase">
          SCROLL
        </span>
        <div className="flex flex-col items-center gap-px">
          <span className="hero__scroll-arrow block w-2 h-2 border-r border-b border-[rgba(255,0,51,0.6)] rotate-45 opacity-0" />
          <span className="hero__scroll-arrow block w-2 h-2 border-r border-b border-[rgba(255,0,51,0.6)] rotate-45 opacity-0" />
        </div>
      </div>

      {/* Mouse glow tracker */}
      <div
        className="hero__mouse-tracker absolute w-[200px] h-[200px] rounded-full pointer-events-none z-[1] opacity-0 -translate-x-1/2 -translate-y-1/2"
        ref={trackerRef}
      />
    </section>
  );
}
