"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { EventHero } from "./EventHero";
import { DynamicTicketWidget } from "./DynamicTicketWidget";
import { TeeModal } from "./TeeModal";
import { DiscountPopup } from "./DiscountPopup";
import { EngagementTracker } from "./EngagementTracker";
import { SocialProofToast } from "./SocialProofToast";
import { isEditorPreview } from "./ThemeEditorBridge";
import { useEventTracking } from "@/hooks/useEventTracking";
import { useCart } from "@/hooks/useCart";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import type { Event, TicketTypeRow } from "@/types/events";

interface DynamicEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

export function DynamicEventPage({ event }: DynamicEventPageProps) {
  const tracking = useEventTracking();
  const { settings } = useSettings();
  const branding = useBranding();
  const headerHidden = useHeaderScroll();

  const cart = useCart({
    eventSlug: event.slug,
    ticketTypes: event.ticket_types || [],
    currency: event.currency,
    tracking,
  });

  // Track PageView + ViewContent on mount (skip in editor preview)
  useEffect(() => {
    if (isEditorPreview()) return;
    tracking.trackPageView();
    const ids = (event.ticket_types || [])
      .filter((tt) => tt.status === "active")
      .map((tt) => tt.id);
    const minPrice = ids.length > 0
      ? Math.min(...(event.ticket_types || []).filter((tt) => tt.status === "active").map((tt) => Number(tt.price)))
      : 0;
    tracking.trackViewContent({
      content_name: `${event.name} — Event Page`,
      content_ids: ids,
      value: minPrice,
      currency: event.currency || "GBP",
    });
  }, [event, tracking]);

  // Merch modal state
  const [teeModalOpen, setTeeModalOpen] = useState(false);
  const [teeModalTicketType, setTeeModalTicketType] = useState<TicketTypeRow | null>(null);

  const handleViewMerch = useCallback((tt: TicketTypeRow) => {
    setTeeModalTicketType(tt);
    setTeeModalOpen(true);
  }, []);

  // Direct function — no ref hack needed
  const handleTeeAdd = useCallback(
    (size: string, qty: number) => {
      if (teeModalTicketType) {
        cart.addMerchExternal(teeModalTicketType.id, size, qty);
      }
    },
    [teeModalTicketType, cart.addMerchExternal]
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

  // Banner image for the hero
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
      {/* Navigation — same as landing page, no announcement banner */}
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
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
                        <div className="event-info__artist" key={artist} onClick={() => tracking.trackEngagement("click_lineup")}>
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
                currency={event.currency}
                ticketTypes={event.ticket_types || []}
                cart={cart}
                ticketGroups={ticketGroups}
                ticketGroupMap={ticketGroupMap}
                onViewMerch={handleViewMerch}
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
