"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { EventHero } from "./EventHero";
import { DynamicTicketWidget } from "./DynamicTicketWidget";
import { TeeModal } from "./TeeModal";
import { BottomBar } from "./BottomBar";
import { DiscountPopup } from "./DiscountPopup";
import { EngagementTracker } from "./EngagementTracker";
import { SocialProofToast } from "./SocialProofToast";
import { isEditorPreview } from "./ThemeEditorBridge";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import { useScrollReveal } from "@/hooks/useScrollReveal";
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
  const scrollRevealRef = useScrollReveal();

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

  // Track cart state from ticket widget for bottom bar
  const [cartTotal, setCartTotal] = useState(0);
  const [cartQty, setCartQty] = useState(0);
  const [cartItems, setCartItems] = useState<{ name: string; qty: number; size?: string }[]>([]);
  const [checkoutFn, setCheckoutFn] = useState<(() => void) | null>(null);

  const handleCartChange = useCallback((total: number, qty: number, items: { name: string; qty: number; size?: string }[]) => {
    setCartTotal(total);
    setCartQty(qty);
    setCartItems(items);
  }, []);

  const handleCheckoutReady = useCallback((fn: (() => void) | null) => {
    setCheckoutFn(() => fn);
  }, []);

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

  const scrollToTickets = useCallback(() => {
    const el = document.getElementById("tickets");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Format date for hero display
  const dateDisplay = useMemo(() => {
    const d = new Date(event.date_start);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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

  // Ticket group data from settings
  const ticketGroups = (settings?.ticket_groups as string[] | undefined) || [];
  const ticketGroupMap = (settings?.ticket_group_map as Record<string, string | null> | undefined) || {};

  return (
    <>
      {/* Navigation — transparent, floats over hero */}
      <header className="header header--transparent" id="header">
        <Header />
      </header>

      <main className="event-page" id="eventPage">
        <EventHero
          title={event.name}
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
              <div className="event-info" id="eventInfo" ref={scrollRevealRef as React.RefObject<HTMLDivElement>}>
                {/* About Section */}
                {event.about_text && (
                  <div className="event-info__section event-info__section--about" data-reveal>
                    <h2 className="event-info__heading">About</h2>
                    <p className="event-info__text">{event.about_text}</p>
                  </div>
                )}

                {/* Lineup Section (moves above About on mobile via CSS order) */}
                {lineup.length > 0 && (
                  <div className="event-info__section event-info__section--lineup" data-reveal>
                    <h2 className="event-info__heading">Lineup</h2>
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
                  <div className="event-info__section event-info__section--details" data-reveal>
                    <h2 className="event-info__heading">Details</h2>
                    <p className="event-info__text">{event.details_text}</p>
                  </div>
                )}

                {/* Description fallback if no structured content */}
                {!event.about_text &&
                  !event.details_text &&
                  event.description && (
                    <div className="event-info__section event-info__section--about" data-reveal>
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
                onCartChange={handleCartChange}
                onCheckoutReady={handleCheckoutReady}
                ticketGroups={ticketGroups}
                ticketGroupMap={ticketGroupMap}
                onViewMerch={handleViewMerch}
                addMerchRef={addMerchRef}
              />
            </div>
          </div>
        </section>
      </main>

      <BottomBar
        fromPrice={`${currSymbol}${minPrice % 1 === 0 ? minPrice : minPrice.toFixed(2)}`}
        cartTotal={cartQty > 0 ? `${currSymbol}${cartTotal.toFixed(2)}` : undefined}
        cartQty={cartQty}
        cartItems={cartItems}
        onBuyNow={scrollToTickets}
        onCheckout={checkoutFn ?? undefined}
      />

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy" data-branding="copyright">
              &copy; {new Date().getFullYear()} {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. All rights reserved.`}
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
