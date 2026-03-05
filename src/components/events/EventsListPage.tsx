"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { EventCard } from "./EventCard";
import type { ListingEvent } from "@/types/events";

import "@/styles/landing.css";

interface EventsListPageProps {
  events: ListingEvent[];
}

export function EventsListPage({ events }: EventsListPageProps) {
  const { push } = useDataLayer();
  const { trackPageView } = useMetaTracking();
  useTraffic();
  useScrollReveal();
  const headerHidden = useHeaderScroll();

  useEffect(() => {
    push({
      event: "view_content",
      content_name: "Events",
      content_type: "listing",
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

      {/* Page content */}
      <main className="min-h-screen bg-[var(--bg-dark,#0e0e0e)]">
        {/* Page header */}
        <div className="pt-32 pb-10 max-md:pt-28 max-md:pb-8 px-6 max-md:px-4">
          <div className="max-w-[1200px] mx-auto" data-reveal="">
            <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.25em] uppercase text-primary mb-4 block">
              [ALL EVENTS]
            </span>
            <h1 className="font-[family-name:var(--font-mono)] text-[clamp(32px,5vw,56px)] font-bold tracking-[0.15em] uppercase mb-4 text-[var(--text-primary,#fff)]">
              Events
            </h1>
            <div className="w-[60px] h-0.5 bg-primary" />
            {events.length > 0 && (
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-[var(--text-primary,#fff)]/40 uppercase mt-3 block">
                {events.length} Event{events.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Events grid */}
        <div className="px-6 max-md:px-4 pb-20">
          <div className="max-w-[1200px] mx-auto">
            {events.length === 0 ? (
              <div className="py-20 text-center" data-reveal="">
                <p className="font-[family-name:var(--font-mono)] text-sm tracking-[0.08em] text-[var(--text-primary,#fff)]/30">
                  No upcoming events. Check back soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>

        <MidnightFooter />
      </main>
    </>
  );
}
