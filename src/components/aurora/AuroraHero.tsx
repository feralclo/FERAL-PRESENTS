"use client";

import { useMemo } from "react";
import { AuroraBadge } from "./ui/badge";
import { AuroraButton } from "./ui/button";
import { AuroraCountdown } from "./AuroraCountdown";

interface AuroraHeroProps {
  title: string;
  date: string;
  dateRaw: string;
  doors: string;
  location: string;
  age: string;
  bannerImage?: string;
  tagLine?: string;
}

export function AuroraHero({
  title,
  date,
  dateRaw,
  doors,
  location,
  age,
  bannerImage,
  tagLine,
}: AuroraHeroProps) {
  const scrollToTickets = () => {
    const el = document.getElementById("tickets");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const hasCountdown = useMemo(() => {
    const eventDate = new Date(dateRaw);
    return eventDate.getTime() > Date.now();
  }, [dateRaw]);

  return (
    <section className="relative min-h-[85vh] flex items-end overflow-hidden">
      {/* Background Image */}
      {bannerImage && (
        <div className="absolute inset-0 z-0">
          <img
            src={bannerImage}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-aurora-bg via-aurora-bg/80 to-aurora-bg/30" />
        </div>
      )}

      {/* Gradient Mesh Overlay */}
      <div className="aurora-mesh" />

      {/* Content */}
      <div className="relative z-10 w-full px-5 pb-10 pt-32 max-w-5xl mx-auto">
        {/* Trust badge */}
        <div className="mb-6">
          <AuroraBadge variant="success" className="gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <path
                d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                fill="currentColor"
                opacity="0.3"
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                fill="currentColor"
              />
            </svg>
            Official Ticket Store
          </AuroraBadge>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-aurora-text leading-[1.1] mb-4">
          {title}
        </h1>

        {/* Tagline */}
        {tagLine && (
          <p className="text-lg sm:text-xl text-aurora-text-secondary mb-6 max-w-2xl">
            {tagLine}
          </p>
        )}

        {/* Event Meta */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-aurora-text-secondary mb-8">
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            {date}
          </span>
          {doors && (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Doors {doors}
            </span>
          )}
          {location && (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
            {age}
          </span>
        </div>

        {/* Countdown */}
        {hasCountdown && (
          <div className="mb-8">
            <AuroraCountdown targetDate={dateRaw} />
          </div>
        )}

        {/* CTA */}
        <AuroraButton size="xl" glow onClick={scrollToTickets}>
          Get Tickets
        </AuroraButton>
      </div>
    </section>
  );
}
