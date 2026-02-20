"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { useEventTracking } from "@/hooks/useEventTracking";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { MidnightHero } from "./MidnightHero";
import { MidnightEventInfo } from "./MidnightEventInfo";
import { MidnightLineup } from "./MidnightLineup";
import { MidnightArtistModal } from "./MidnightArtistModal";
import { MidnightFooter } from "./MidnightFooter";
import { isMuxPlaybackId, getMuxStreamUrl, getMuxThumbnailUrl } from "@/lib/mux";
import type { Event } from "@/types/events";
import type { Artist, EventArtist } from "@/types/artists";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface MidnightExternalPageProps {
  event: Event & { event_artists?: EventArtist[] };
}

/**
 * Simplified Midnight event page for events with external ticketing.
 * Reuses MidnightHero, MidnightEventInfo, MidnightLineup, MidnightFooter.
 * Replaces ticket widget with a single prominent CTA linking to event.external_link.
 */
export function MidnightExternalPage({ event }: MidnightExternalPageProps) {
  const tracking = useEventTracking();
  const headerHidden = useHeaderScroll();
  const revealRef = useScrollReveal();

  // Track PageView + ViewContent on mount
  useEffect(() => {
    if (isEditorPreview()) return;
    tracking.trackPageView();
    tracking.trackViewContent({
      content_name: `${event.name} — Event Page`,
      content_ids: [event.id],
      value: 0,
      currency: event.currency || "GBP",
    });
  }, [event, tracking]);

  // Format date for hero
  const dateDisplay = useMemo(() => {
    const d = new Date(event.date_start);
    return d
      .toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      .toUpperCase();
  }, [event.date_start]);

  const locationDisplay = [event.venue_name, event.city]
    .filter(Boolean)
    .join(", ");

  const doorsDisplay = event.doors_time || "";

  const heroImage =
    event.hero_image ||
    event.cover_image ||
    `/api/media/event_${event.id}_banner`;

  // Derive lineup: prefer event_artists (sorted), fall back to events.lineup
  const isAlphabetical = !!event.lineup_sort_alphabetical;
  const lineup = useMemo(() => {
    const ea = event.event_artists;
    if (ea && ea.length > 0) {
      const names = ea
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => e.artist?.name)
        .filter(Boolean) as string[];
      if (isAlphabetical) {
        return names.sort((a, b) => a.localeCompare(b));
      }
      return names;
    }
    const fallback = event.lineup || [];
    return isAlphabetical ? [...fallback].sort((a, b) => a.localeCompare(b)) : fallback;
  }, [event.event_artists, event.lineup, isAlphabetical]);

  // Artist profiles — build a name->Artist map for the lineup component
  const artistProfiles = useMemo(() => {
    const map = new Map<string, Artist>();
    const eventArtists = event.event_artists;
    if (eventArtists && eventArtists.length > 0) {
      for (const ea of eventArtists) {
        if (ea.artist) {
          map.set(ea.artist.name, ea.artist);
        }
      }
    }
    return map;
  }, [event.event_artists]);

  const artistsWithProfiles = useMemo(() => {
    const result: Artist[] = [];
    for (const name of lineup) {
      const profile = artistProfiles.get(name);
      if (profile) result.push(profile);
    }
    return result;
  }, [lineup, artistProfiles]);

  // Preload artist videos
  useEffect(() => {
    if (artistsWithProfiles.length === 0) return;
    const videos = artistsWithProfiles.filter(
      (a) => a.video_url && isMuxPlaybackId(a.video_url)
    );
    if (videos.length === 0) return;

    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 2000);

    const cancel =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : clearTimeout;

    const id = idle(() => {
      for (const a of videos) preloadMuxVideo(a.video_url!);
    });

    return () => cancel(id as number);
  }, [artistsWithProfiles]);

  // Artist modal state
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [selectedArtistIndex, setSelectedArtistIndex] = useState(0);

  const handleArtistClick = useCallback(
    (artist: Artist) => {
      const idx = artistsWithProfiles.findIndex((a) => a.id === artist.id);
      setSelectedArtistIndex(idx >= 0 ? idx : 0);
      setArtistModalOpen(true);
    },
    [artistsWithProfiles]
  );

  const externalLink = event.external_link || "#";

  return (
    <>
      {/* Navigation */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <Header />
      </header>

      <main
        ref={revealRef as React.RefObject<HTMLElement>}
        className="pt-[var(--header-height)] bg-background min-h-screen"
      >
        <MidnightHero
          title={event.name.toUpperCase()}
          date={dateDisplay}
          doors={doorsDisplay}
          location={locationDisplay}
          age={event.age_restriction || "18+"}
          bannerImage={heroImage}
          tag={event.tag_line || ""}
        />

        <section className="relative z-10 pt-16 pb-16 max-md:pt-6 max-md:pb-10 pointer-events-none">
          <div className="max-w-[1200px] mx-auto px-6 max-md:px-0 pointer-events-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-[var(--midnight-section-gap)]">
              {/* Left: Event Info */}
              <div className="max-lg:order-2 max-lg:px-[var(--midnight-content-px)] max-lg:pb-24 max-lg:flex max-lg:flex-col">
                {/* Mobile section divider */}
                <div className="lg:hidden order-[-2] mb-14 max-[480px]:mb-10 pt-6 max-[480px]:pt-5">
                  <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
                </div>

                {/* Lineup on mobile (above about) */}
                {lineup.length > 0 && (
                  <div
                    className="lg:hidden order-[-1] mb-12 max-md:mb-10"
                    data-reveal="1"
                  >
                    <MidnightLineup
                      artists={lineup}
                      isAlphabetical={isAlphabetical}
                      artistProfiles={artistProfiles}
                      onArtistClick={handleArtistClick}
                    />
                  </div>
                )}

                <div data-reveal="2">
                  <MidnightEventInfo
                    aboutText={event.about_text}
                    detailsText={event.details_text}
                    description={event.description}
                  />
                </div>

                {/* Desktop lineup */}
                {lineup.length > 0 && (
                  <div className="hidden lg:block mt-16" data-reveal="3">
                    <MidnightLineup
                      artists={lineup}
                      isAlphabetical={isAlphabetical}
                      artistProfiles={artistProfiles}
                      onArtistClick={handleArtistClick}
                    />
                  </div>
                )}
              </div>

              {/* Right: External Ticket CTA — replaces MidnightTicketWidget */}
              <div className="max-lg:order-1">
                <div>
                  <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] shadow-[0_2px_24px_rgba(0,0,0,0.4)] backdrop-blur-sm p-8 max-md:mx-[var(--midnight-content-px)] max-md:p-6">
                    {/* Heading */}
                    <h3 className="font-[family-name:var(--font-sans)] text-xs font-bold tracking-[0.18em] uppercase text-foreground/50 mb-6">
                      Tickets
                    </h3>

                    {/* Divider */}
                    <div className="h-px bg-gradient-to-r from-foreground/[0.08] via-foreground/[0.04] to-transparent mb-8" />

                    {/* CTA */}
                    <a
                      href={externalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative flex items-center justify-center w-full h-14 rounded-xl text-[14px] font-bold tracking-[0.04em] uppercase transition-all duration-300 bg-white text-[#0e0e0e] shadow-[0_0_30px_rgba(255,255,255,0.08)] hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Buy Tickets
                      <svg
                        className="ml-2.5 w-4 h-4 opacity-50 transition-transform duration-200 group-hover:translate-x-0.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 17L17 7" />
                        <path d="M7 7h10v10" />
                      </svg>
                    </a>

                    {/* Subtle hint */}
                    <p className="mt-4 text-center font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] text-foreground/20">
                      Opens external ticket store
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MidnightFooter />

      {/* Fixed bottom bar — mobile CTA for external link */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[997] lg:hidden midnight-bottom-bar will-change-transform ${
          headerHidden ? "translate-y-full" : "translate-y-0"
        }`}
        style={{
          transition: "transform 400ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      >
        <div className="px-5 pt-3.5 pb-[max(16px,calc(12px+env(safe-area-inset-bottom)))]">
          <a
            href={externalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-full h-11 text-[13px] font-bold tracking-[0.03em] rounded-xl bg-white text-[#0e0e0e] active:scale-[0.97] transition-transform duration-150"
          >
            Buy Tickets
            <svg
              className="ml-2 w-3.5 h-3.5 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17L17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        </div>
      </div>

      {/* Artist Profile Modal */}
      <MidnightArtistModal
        artists={artistsWithProfiles}
        currentIndex={selectedArtistIndex}
        isOpen={artistModalOpen}
        onClose={() => setArtistModalOpen(false)}
        onNavigate={setSelectedArtistIndex}
      />

      {/* Engagement features */}
      <EngagementTracker />
    </>
  );
}

async function preloadMuxVideo(playbackId: string) {
  try {
    const img = new Image();
    img.src = getMuxThumbnailUrl(playbackId);
    await fetch(getMuxStreamUrl(playbackId));
  } catch {
    // Best-effort
  }
}
