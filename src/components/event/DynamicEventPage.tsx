"use client";

import { useState, useCallback, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { EventHero } from "./EventHero";
import { DynamicTicketWidget } from "./DynamicTicketWidget";
import { BottomBar } from "./BottomBar";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import type { Event, TicketTypeRow } from "@/types/events";

interface DynamicEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

export function DynamicEventPage({ event }: DynamicEventPageProps) {
  const headerHidden = useHeaderScroll();

  // Track cart state from ticket widget for bottom bar
  const [cartTotal, setCartTotal] = useState(0);
  const [cartQty, setCartQty] = useState(0);

  const handleCartChange = useCallback((total: number, qty: number) => {
    setCartTotal(total);
    setCartQty(qty);
  }, []);

  const scrollToTickets = useCallback(() => {
    const el = document.getElementById("tickets");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

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

  // Hero image — try cover_image (URL or base64), then hero_image,
  // then fall back to the media serving URL (in case DB column doesn't exist
  // but image was uploaded via the upload API to site_settings)
  const heroImage = event.cover_image || event.hero_image || `/api/media/event_${event.id}_cover`;

  // Lowest price for bottom bar
  const activeTypes = (event.ticket_types || []).filter(
    (tt) => tt.status === "active"
  );
  const minPrice =
    activeTypes.length > 0
      ? Math.min(...activeTypes.map((tt) => Number(tt.price)))
      : 0;
  const currSymbol =
    event.currency === "GBP" ? "£" : event.currency === "EUR" ? "€" : "$";

  // Lineup from DB
  const lineup = event.lineup || [];

  return (
    <>
      {/* Navigation */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
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
                fill="#fff"
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                fill="#ff0033"
              />
            </svg>
          </span>
          <span className="announcement-banner__verified">
            Official FERAL ticket store
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
                  <div className="event-info__section">
                    <h2 className="event-info__heading">About</h2>
                    <p className="event-info__text">{event.about_text}</p>
                  </div>
                )}

                {/* Lineup Section */}
                {lineup.length > 0 && (
                  <div className="event-info__section">
                    <h2 className="event-info__heading">
                      Lineup{" "}
                      <span className="event-info__az">[A-Z]</span>
                    </h2>
                    <div className="event-info__lineup">
                      {lineup.map((artist) => (
                        <div className="event-info__artist" key={artist}>
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
                  <div className="event-info__section">
                    <h2 className="event-info__heading">Details</h2>
                    <p className="event-info__text">{event.details_text}</p>
                  </div>
                )}

                {/* Description fallback if no structured content */}
                {!event.about_text &&
                  !event.details_text &&
                  event.description && (
                    <div className="event-info__section">
                      <h2 className="event-info__heading">About</h2>
                      <p className="event-info__text">{event.description}</p>
                    </div>
                  )}
              </div>

              {/* Right: Ticket Widget */}
              <DynamicTicketWidget
                eventSlug={event.slug}
                ticketTypes={event.ticket_types || []}
                currency={event.currency}
                onCartChange={handleCartChange}
              />
            </div>
          </div>
        </section>
      </main>

      <BottomBar
        fromPrice={`${currSymbol}${minPrice % 1 === 0 ? minPrice : minPrice.toFixed(2)}`}
        cartTotal={cartQty > 0 ? `${currSymbol}${cartTotal.toFixed(2)}` : undefined}
        cartQty={cartQty}
        onBuyNow={scrollToTickets}
      />

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy">
              &copy; 2026 FERAL PRESENTS. ALL RIGHTS RESERVED.
            </span>
            <span className="footer__status">
              STATUS: <span className="text-red">ONLINE</span>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
