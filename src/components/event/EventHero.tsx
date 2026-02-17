"use client";

import { useState, useEffect, useRef } from "react";

interface EventHeroProps {
  title: string;
  date: string;
  doors: string;
  location: string;
  age: string;
  bannerImage: string;
  coverImage?: string | null;
  tag?: string;
}

export function EventHero({
  title,
  date,
  doors,
  location,
  age,
  bannerImage,
  coverImage,
  tag,
}: EventHeroProps) {
  const imgSrc = coverImage || bannerImage;
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  // Subtle parallax on desktop (translateY on scroll * 0.3)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;

    const hero = heroRef.current;
    if (!hero) return;

    const bgImg = hero.querySelector<HTMLElement>(".event-hero__bg-img");
    if (!bgImg) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        bgImg.style.transform = `translateY(${scrollY * 0.3}px) scale(1.05)`;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTickets = () => {
    const el = document.getElementById("tickets");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="event-hero" ref={heroRef}>
      <div className="event-hero__bg">
        {imgSrc && !imgFailed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imgSrc}
            alt={title}
            className={`event-hero__bg-img${imgLoaded ? " event-hero__bg-img--loaded" : ""}`}
            onError={() => setImgFailed(true)}
            onLoad={() => setImgLoaded(true)}
          />
        )}
        <div className="event-hero__gradient" />
      </div>
      <div className="container">
        <div className="event-hero__content">
          {tag && (
            <div className="event-hero__badge">
              <span className="event-hero__badge-dot" />
              <span className="event-hero__badge-text">{tag}</span>
            </div>
          )}

          <h1 className="event-hero__title">{title}</h1>

          <div className="event-hero__details">
            <span className="event-hero__detail-value">{date}</span>
            <span className="event-hero__detail-divider" />
            <span className="event-hero__detail-value">{doors}</span>
            <span className="event-hero__detail-divider" />
            <span className="event-hero__detail-value">{location}</span>
            <span className="event-hero__detail-divider" />
            <span className="event-hero__detail-value">{age}</span>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <button
        className="event-hero__scroll-hint"
        onClick={scrollToTickets}
        aria-label="Scroll to tickets"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 7L10 13L16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </section>
  );
}
