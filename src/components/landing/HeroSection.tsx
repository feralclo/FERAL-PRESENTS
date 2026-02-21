"use client";

import { useRef, useCallback, useEffect } from "react";
import { ParticleCanvas } from "./ParticleCanvas";
import { HeroGlitchText } from "./HeroGlitchText";

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackerRef = useRef<HTMLDivElement>(null);

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
      className="hero"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="hero__bg" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/banner-1.jpg" alt="" className="hero__bg-image" />
        <div className="hero__bg-glitch" />
        <div className="hero__bg-overlay" />
      </div>
      <ParticleCanvas />
      <div className="hero__content">
        <HeroGlitchText />
        <a href="#events" className="hero__cta" onClick={handleCtaClick}>
          <span className="hero__cta-text" data-text="SEE EVENTS">
            SEE EVENTS
          </span>
          <span className="hero__cta-glitch" />
          <span className="hero__cta-glow" />
        </a>
      </div>
      <div className="hero__scroll-indicator">
        <div className="hero__scroll-mouse">
          <div className="hero__scroll-wheel" />
        </div>
        <span className="hero__scroll-text">SCROLL</span>
        <div className="hero__scroll-arrows">
          <span className="hero__scroll-arrow" />
          <span className="hero__scroll-arrow" />
        </div>
      </div>
      <div className="hero__mouse-tracker" ref={trackerRef} />
    </section>
  );
}
