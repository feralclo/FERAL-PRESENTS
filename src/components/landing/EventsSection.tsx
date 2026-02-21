"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LandingEvent } from "@/types/events";

interface EventsSectionProps {
  events: LandingEvent[];
}

export function EventsSection({ events }: EventsSectionProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [hintVisible, setHintVisible] = useState(true);

  // Hide swipe hint after user scrolls
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    function onScroll() {
      if (grid!.scrollLeft > 30) {
        setHintVisible(false);
      }
    }

    grid.addEventListener("scroll", onScroll, { passive: true });
    return () => grid.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section id="events" className="py-20 max-md:py-14 bg-background">
      <div className="max-w-[1200px] mx-auto px-6 max-md:px-4">
        {/* Section header */}
        <div className="mb-14 max-md:mb-10" data-reveal="">
          <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.25em] uppercase text-primary mb-4 block">
            [UPCOMING]
          </span>
          <h2 className="font-[family-name:var(--font-mono)] text-[clamp(32px,5vw,56px)] font-bold tracking-[0.15em] uppercase mb-4">
            Events
          </h2>
          <div className="w-[60px] h-0.5 bg-primary" />
          {events.length > 0 && (
            <span className="lg:hidden font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-foreground/40 uppercase mt-3 block">
              {events.length} Event{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Empty state */}
        {events.length === 0 && (
          <div className="py-16 text-center" data-reveal="">
            <p className="font-[family-name:var(--font-mono)] text-sm tracking-[0.08em] text-foreground/30">
              No upcoming events. Check back soon.
            </p>
          </div>
        )}

        {/* Event grid — 2-col on desktop, horizontal snap scroll on mobile */}
        {events.length > 0 && (
          <div
            ref={gridRef}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-lg:flex max-lg:overflow-x-auto max-lg:snap-x max-lg:snap-mandatory max-lg:-mx-6 max-lg:px-6 max-lg:gap-5"
            style={{ scrollbarWidth: "none" }}
          >
            {events.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
          </div>
        )}

        {/* Swipe hint — mobile only */}
        {events.length > 1 && (
          <div
            className={`lg:hidden flex items-center justify-center gap-2 mt-5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.25em] text-foreground/30 uppercase transition-opacity duration-500 ${
              hintVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <span>SWIPE</span>
            <span className="inline-block animate-[swipeArrow_1.5s_ease-in-out_infinite]">
              &rarr;
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function EventCard({
  event,
  index,
}: {
  event: LandingEvent;
  index: number;
}) {
  const d = new Date(event.date_start);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();

  const isExternal = event.payment_method === "external";
  const href =
    isExternal && event.external_link
      ? event.external_link
      : `/event/${event.slug}/`;

  const imageUrl = event.cover_image || `/api/media/event_${event.id}_cover`;

  const linkProps = isExternal
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Link
      href={href}
      {...linkProps}
      className="group block relative rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] overflow-hidden transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_8px_40px_rgba(255,0,51,0.1),0_0_0_1px_rgba(255,0,51,0.12)] max-lg:snap-start max-lg:shrink-0 max-lg:w-[85vw] max-lg:max-w-[400px]"
      data-reveal=""
    >
      {/* Date badge */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-center bg-background/90 backdrop-blur-sm border border-foreground/[0.10] px-3.5 py-2.5 rounded-lg transition-all duration-300 group-hover:border-primary/30 group-hover:shadow-[0_0_20px_rgba(255,0,51,0.1)]">
        <span className="font-[family-name:var(--font-mono)] text-[22px] font-bold leading-none tracking-[0.02em]">
          {day}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-primary mt-0.5">
          {month}
        </span>
      </div>

      {/* Image — 16:9 aspect ratio */}
      <div className="relative aspect-video overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={event.name}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] saturate-[0.85] group-hover:scale-105 group-hover:saturate-100"
        />
        {/* Bottom gradient — fades into card */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-background)] via-transparent to-transparent z-[1]" />
        {/* Top vignette — date badge readability */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/30 to-transparent z-[1]" />
        {/* Scan line */}
        <div
          className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent z-[2] pointer-events-none animate-[cardScan_4s_ease-in-out_infinite]"
          style={index > 0 ? { animationDelay: `${index * 1.5}s` } : undefined}
        />
      </div>

      {/* Content */}
      <div className="p-6 max-[480px]:p-4">
        {/* Tag line */}
        {event.tag_line && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-primary uppercase block mb-3">
            // {event.tag_line}
          </span>
        )}

        {/* Event name */}
        <h3 className="font-[family-name:var(--font-mono)] text-[clamp(20px,3vw,28px)] font-bold tracking-[0.12em] uppercase mb-4 transition-colors duration-300 group-hover:text-primary">
          {event.name.toUpperCase()}
        </h3>

        {/* Venue + doors */}
        <div className="flex flex-col gap-1.5 mb-5">
          {(event.venue_name || event.city) && (
            <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/50">
              <span className="text-foreground/25 mr-1">LOC:</span>
              {[event.venue_name, event.city].filter(Boolean).join(", ")}
            </span>
          )}
          {event.doors_time && (
            <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/50">
              <span className="text-foreground/25 mr-1">TIME:</span>
              {event.doors_time}
            </span>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 pt-4 border-t border-foreground/[0.06]">
          <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold tracking-[0.15em] uppercase transition-colors duration-300 group-hover:text-primary">
            {isExternal ? "BUY TICKETS" : "GET TICKETS"}
          </span>
          <span className="text-sm transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-primary">
            {isExternal ? "\u2197" : "\u2192"}
          </span>
        </div>
      </div>

      {/* Inner border glow on hover */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 transition-opacity duration-500 group-hover:opacity-100 shadow-[inset_0_0_30px_rgba(255,0,51,0.06)]" />
    </Link>
  );
}
