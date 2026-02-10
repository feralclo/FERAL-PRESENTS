"use client";

import { useState, useCallback, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { EventHero } from "./EventHero";
import { TicketWidget } from "./TicketWidget";
import { TeeModal } from "./TeeModal";
import { BottomBar } from "./BottomBar";
import { DiscountPopup } from "./DiscountPopup";
import { EngagementTracker } from "./EngagementTracker";
import { useSettings } from "@/hooks/useSettings";
import { useTicketCart } from "@/hooks/useTicketCart";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import type { TeeSize } from "@/types/tickets";

interface LiverpoolEventPageProps {
  slug: string;
}

export function LiverpoolEventPage({ slug }: LiverpoolEventPageProps) {
  const { settings } = useSettings();
  const cart = useTicketCart(settings);
  const { push } = useDataLayer();
  const [teeModalOpen, setTeeModalOpen] = useState(false);
  const headerHidden = useHeaderScroll();

  // Track view_content on mount
  useEffect(() => {
    push({
      event: "view_content",
      content_name: "FERAL Liverpool — Event Page",
      content_ids: [
        "6b45169f-cf51-4600-8682-d6f79dcb59ae",
        "bb73bb64-ba1a-4a23-9a05-f2b57bca51cf",
        "53c5262b-93ba-412e-bb5c-84ebc445a734",
      ],
      content_type: "product",
      value: 26.46,
      currency: "GBP",
    });
  }, [push]);

  const handleTeeAdd = useCallback(
    (size: TeeSize, qty: number) => {
      for (let i = 0; i < qty; i++) {
        cart.addTeeSize(size);
      }
    },
    [cart]
  );

  const scrollToTickets = useCallback(() => {
    const el = document.getElementById("tickets");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const coverImage = settings?.minimalBgImage || null;

  return (
    <>
      {/* Navigation */}
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
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
          title="LIVERPOOL"
          date="27 MARCH 2026"
          doors="9:30PM — 4:00AM"
          location="Invisible Wind Factory, Liverpool"
          age="18+"
          bannerImage="/images/liverpool-event-banner.jpg"
          coverImage={coverImage}
          tag="SECOND RELEASE NOW ACTIVE"
        />

        <section className="event-content">
          <div className="container">
            <div className="event-content__grid">
              {/* Left: Event Info */}
              <div className="event-info" id="eventInfo">
                <div className="event-info__section">
                  <h2 className="event-info__heading">About</h2>
                  <p className="event-info__text">
                    FERAL takes over Invisible Wind Factory on 27 March with a
                    full 360° setup and the most immersive production build the
                    venue has ever seen. A stacked lineup built as a journey -
                    hard bounce into hard techno, descending into industrial,
                    before finally erupting in hardstyle and rawstyle.
                  </p>
                </div>

                <div className="event-info__section">
                  <h2 className="event-info__heading">
                    Lineup{" "}
                    <span className="event-info__az">[A-Z]</span>
                  </h2>
                  <div className="event-info__lineup">
                    {[
                      "DARK MATTER",
                      "MIKA HEGGEMAN",
                      "NICOLAS JULIAN",
                      "SANDY KLETZ",
                      "SO JUICE",
                      "STEVIE",
                    ].map((artist) => (
                      <div className="event-info__artist" key={artist}>
                        <span className="event-info__artist-name">
                          {artist}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="event-info__section">
                  <h2 className="event-info__heading">Details</h2>
                  <p className="event-info__text">
                    This is an 18+ event. Valid photo ID required at the door. No
                    re-entry. The venue operates a zero-tolerance policy.
                    Accessibility info available on request.
                  </p>
                </div>
              </div>

              {/* Right: Ticket Widget */}
              <TicketWidget
                eventSlug={slug}
                cart={cart}
                onViewTee={() => setTeeModalOpen(true)}
              />
            </div>
          </div>
        </section>
      </main>

      <BottomBar onBuyNow={scrollToTickets} />

      <TeeModal
        isOpen={teeModalOpen}
        onClose={() => setTeeModalOpen(false)}
        onAddToCart={handleTeeAdd}
      />

      <DiscountPopup />
      <EngagementTracker />

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
