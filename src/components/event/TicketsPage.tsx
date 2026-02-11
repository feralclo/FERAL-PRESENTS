"use client";

import { useState, useCallback, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { TicketWidget } from "./TicketWidget";
import { TeeModal } from "./TeeModal";
import { BottomBar } from "./BottomBar";
import { SocialProofToast } from "./SocialProofToast";
import { DiscountPopup } from "./DiscountPopup";
import { EngagementTracker } from "./EngagementTracker";
import { useSettings } from "@/hooks/useSettings";
import { useTicketCart } from "@/hooks/useTicketCart";
import { useDataLayer } from "@/hooks/useDataLayer";
import type { TeeSize } from "@/types/tickets";
import "@/styles/tickets-page.css";

interface TicketsPageProps {
  slug: string;
}

export function TicketsPage({ slug }: TicketsPageProps) {
  const { settings } = useSettings();
  const cart = useTicketCart(settings);
  const { push } = useDataLayer();
  const [teeModalOpen, setTeeModalOpen] = useState(false);

  useEffect(() => {
    push({
      event: "view_content",
      content_name: "FERAL Liverpool — Tickets",
      content_type: "product",
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
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleCheckout = useCallback(() => {
    const url = cart.getCheckoutUrl(slug);
    if (url) window.location.assign(url);
  }, [cart, slug]);

  return (
    <>
      <header className="header" id="header">
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

      <main className="event-page tickets-page" id="eventPage">
        <section className="event-content" style={{ paddingTop: "120px" }}>
          <div className="container">
            <div className="event-content__grid">
              <div className="event-info" id="eventInfo">
                <h1 className="event-info__heading" style={{ fontSize: "2rem" }}>
                  FERAL Liverpool
                </h1>
                <p className="event-info__text">
                  27 March 2026 &mdash; Invisible Wind Factory, Liverpool
                  <br />
                  9:30PM &mdash; 4:00AM &mdash; 18+
                </p>
              </div>

              <TicketWidget
                eventSlug={slug}
                cart={cart}
                onViewTee={() => setTeeModalOpen(true)}
              />
            </div>
          </div>
        </section>
      </main>

      <BottomBar
        fromPrice={`£${cart.totalPrice > 0 ? cart.totalPrice.toFixed(2) : "26.46"}`}
        cartTotal={cart.totalQty > 0 ? `£${cart.totalPrice.toFixed(2)}` : undefined}
        cartQty={cart.totalQty}
        onBuyNow={scrollToTickets}
        onCheckout={handleCheckout}
      />

      <TeeModal
        isOpen={teeModalOpen}
        onClose={() => setTeeModalOpen(false)}
        onAddToCart={handleTeeAdd}
      />

      <SocialProofToast />
      <DiscountPopup mobileDelay={4000} desktopDelay={4000} />
      <EngagementTracker />

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
