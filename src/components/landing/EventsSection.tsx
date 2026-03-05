"use client";

import Link from "next/link";
import type { LandingEvent } from "@/types/events";

interface EventsSectionProps {
  events: LandingEvent[];
}

/** Max events shown on mobile before "See All" link */
const MOBILE_LIMIT = 3;

export function EventsSection({ events }: EventsSectionProps) {
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
            <span className="md:hidden font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-foreground/40 uppercase mt-3 block">
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

        {/* Event grid — responsive vertical stack */}
        {events.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {events.map((event, i) => (
              <EventCard
                key={event.id}
                event={event}
                className={i >= MOBILE_LIMIT ? "hidden md:block" : undefined}
              />
            ))}
          </div>
        )}

        {/* "See All Events" link — shown when more events than mobile limit */}
        {events.length > MOBILE_LIMIT && (
          <div className="mt-10 text-center md:hidden" data-reveal="">
            <Link
              href="/events/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] font-[family-name:var(--font-mono)] text-[11px] tracking-[0.15em] uppercase text-foreground/60 transition-all duration-300 hover:border-primary/40 hover:text-primary hover:bg-foreground/[0.06]"
            >
              See All Events
              <span className="text-sm">&rarr;</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function EventCard({ event, className }: { event: LandingEvent; className?: string }) {
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
      className={`group block relative rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] overflow-hidden transition-[transform,border-color,box-shadow] duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_8px_40px_color-mix(in_srgb,var(--accent)_10%,transparent),0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]${className ? ` ${className}` : ""}`}
    >
      {/* Date badge */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-center bg-background/95 border border-foreground/[0.10] px-3.5 py-2.5 rounded-lg transition-[border-color,box-shadow] duration-300 group-hover:border-primary/30 group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
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
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
        />
        {/* Bottom gradient — fades into card */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-background)] via-transparent to-transparent z-[1]" />
        {/* Top vignette — date badge readability */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/30 to-transparent z-[1]" />
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
      <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 transition-opacity duration-500 group-hover:opacity-100 shadow-[inset_0_0_30px_color-mix(in_srgb,var(--accent)_6%,transparent)]" />
    </Link>
  );
}
