"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { EventHero } from "./EventHero";
import { DynamicTicketWidget } from "./DynamicTicketWidget";
import { TeeModal } from "./TeeModal";
import { DiscountPopup } from "./DiscountPopup";
import { EngagementTracker } from "./EngagementTracker";
import { SocialProofToast } from "./SocialProofToast";
import { isEditorPreview } from "./ThemeEditorBridge";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import type { Event, TicketTypeRow } from "@/types/events";

interface DynamicEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

export function DynamicEventPage({ event }: DynamicEventPageProps) {
  const { trackPageView, trackViewContent } = useMetaTracking();
  const { trackEngagement } = useTraffic();
  const { trackViewContent: gtmTrackViewContent } = useDataLayer();
  const { settings } = useSettings();
  const branding = useBranding();
  const headerHidden = useHeaderScroll();

  // Track whether user has scrolled past the hero for header transparency
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    function onScroll() {
      setPastHero(window.scrollY > window.innerHeight * 0.6);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Track PageView + ViewContent on mount (skip in editor preview)
  useEffect(() => {
    if (isEditorPreview()) return;
    trackPageView();
    const ids = (event.ticket_types || [])
      .filter((tt) => tt.status === "active")
      .map((tt) => tt.id);
    const minPrice = ids.length > 0
      ? Math.min(...(event.ticket_types || []).filter((tt) => tt.status === "active").map((tt) => Number(tt.price)))
      : 0;
    trackViewContent({
      content_name: `${event.name} — Event Page`,
      content_ids: ids,
      content_type: "product",
      value: minPrice,
      currency: event.currency || "GBP",
    });
    gtmTrackViewContent(`${event.name} — Event Page`, ids, minPrice);
  }, [event, trackPageView, trackViewContent, gtmTrackViewContent]);

  // Merch modal state
  const [teeModalOpen, setTeeModalOpen] = useState(false);
  const [teeModalTicketType, setTeeModalTicketType] = useState<TicketTypeRow | null>(null);

  const handleViewMerch = useCallback((tt: TicketTypeRow) => {
    setTeeModalTicketType(tt);
    setTeeModalOpen(true);
  }, []);

  // Ref for adding merch from TeeModal into the ticket widget cart
  const addMerchRef = useRef<((ticketTypeId: string, size: string, qty: number) => void) | null>(null);

  const handleTeeAdd = useCallback(
    (size: string, qty: number) => {
      if (teeModalTicketType && addMerchRef.current) {
        addMerchRef.current(teeModalTicketType.id, size, qty);
      }
    },
    [teeModalTicketType]
  );

  // Format date for hero display
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

  // Build location string
  const locationDisplay = [event.venue_name, event.city]
    .filter(Boolean)
    .join(", ");

  // Doors display
  const doorsDisplay = event.doors_time || "";

  // Banner image for the hero: hero_image (banner) is primary, cover_image (tile) is fallback,
  // then try the media serving URL (in case DB columns don't exist but image was uploaded)
  const heroImage = event.hero_image || event.cover_image
    || `/api/media/event_${event.id}_banner`;

  const currSymbol =
    event.currency === "GBP" ? "£" : event.currency === "EUR" ? "€" : "$";

  // Lineup from DB
  const lineup = event.lineup || [];

  // Ticket group data from settings
  const ticketGroups = (settings?.ticket_groups as string[] | undefined) || [];
  const ticketGroupMap = (settings?.ticket_group_map as Record<string, string | null> | undefined) || {};

  return (
    <>
      {/* Navigation */}
      <header
        className={`header${!pastHero ? " header--transparent" : ""}${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <div className="announcement-banner">
          <span className="announcement-banner__shield">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                style={{ fill: "var(--text-primary, #fff)" }}
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                style={{ fill: "var(--accent, #ff0033)" }}
              />
            </svg>
          </span>
          <span className="announcement-banner__verified">
            Official {branding.org_name || "FERAL"} ticket store
          </span>
        </div>
        <Header />
      </header>

      <main className="event-page" id="eventPage">
        <EventHero
          title={event.name.toUpperCase()}
          date={dateDisplay}
          doors={doorsDisplay}
          location={locationDisplay}
          age={event.age_restriction || "18+"}
          bannerImage={heroImage}
          coverImage={heroImage || null}
          tag={event.tag_line || ""}
        />

        <section className="event-content">
          <div className="container">
            <div className="event-content__grid">
              {/* Left: Event Info */}
              <div className="event-info" id="eventInfo">
                {/* About Section */}
                {event.about_text && (
                  <div className="event-info__section event-info__section--about">
                    <h2 className="event-info__heading">About</h2>
                    <p className="event-info__text">{event.about_text}</p>
                  </div>
                )}

                {/* Lineup Section (moves above About on mobile via CSS order) */}
                {lineup.length > 0 && (
                  <div className="event-info__section event-info__section--lineup">
                    <h2 className="event-info__heading">
                      Lineup{" "}
                      <span className="event-info__az">[A-Z]</span>
                    </h2>
                    <div className="event-info__lineup">
                      {lineup.map((artist) => (
                        <div className="event-info__artist" key={artist} onClick={() => trackEngagement("click_lineup")}>
                          <span className="event-info__artist-name">
                            {artist}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Details Section */}
                {event.details_text && (
                  <div className="event-info__section event-info__section--details">
                    <h2 className="event-info__heading">Details</h2>
                    <p className="event-info__text">{event.details_text}</p>
                  </div>
                )}

                {/* Description fallback if no structured content */}
                {!event.about_text &&
                  !event.details_text &&
                  event.description && (
                    <div className="event-info__section event-info__section--about">
                      <h2 className="event-info__heading">About</h2>
                      <p className="event-info__text">{event.description}</p>
                    </div>
                  )}
              </div>

              {/* Right: Ticket Widget */}
              <DynamicTicketWidget
                eventSlug={event.slug}
                eventId={event.id}
                paymentMethod={event.payment_method}
                ticketTypes={event.ticket_types || []}
                currency={event.currency}
                ticketGroups={ticketGroups}
                ticketGroupMap={ticketGroupMap}
                onViewMerch={handleViewMerch}
                addMerchRef={addMerchRef}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy" data-branding="copyright">
              &copy; {new Date().getFullYear()} {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. ALL RIGHTS RESERVED.`}
            </span>
            <span className="footer__status">
              STATUS: <span className="text-red">ONLINE</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Merch Modal — data-driven from ticket type config */}
      {teeModalTicketType && (
        <TeeModal
          isOpen={teeModalOpen}
          onClose={() => setTeeModalOpen(false)}
          onAddToCart={handleTeeAdd}
          merchName={
            (teeModalTicketType.product_id && teeModalTicketType.product
              ? teeModalTicketType.product.name
              : teeModalTicketType.merch_name)
              || (teeModalTicketType.merch_type
                ? `${event.name} ${teeModalTicketType.merch_type}`
                : `${event.name} Merch`)
          }
          merchDescription={
            teeModalTicketType.product_id && teeModalTicketType.product
              ? teeModalTicketType.product.description
              : teeModalTicketType.merch_description
          }
          merchImages={
            teeModalTicketType.product_id && teeModalTicketType.product
              ? teeModalTicketType.product.images
              : teeModalTicketType.merch_images
          }
          merchPrice={Number(teeModalTicketType.price)}
          currencySymbol={currSymbol}
          availableSizes={
            teeModalTicketType.product_id && teeModalTicketType.product
              ? teeModalTicketType.product.sizes
              : teeModalTicketType.merch_sizes
          }
          vipBadge={`Includes ${teeModalTicketType.name} \u2014 ${event.name}`}
        />
      )}

      {/* Engagement features */}
      <DiscountPopup />
      <EngagementTracker />
      <SocialProofToast />
    </>
  );
}
