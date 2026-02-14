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
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import type { Event, TicketTypeRow } from "@/types/events";

interface DynamicEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

export function DynamicEventPage({ event }: DynamicEventPageProps) {
  const headerHidden = useHeaderScroll();
  const { trackViewContent } = useMetaTracking();
  const { settings } = useSettings();
  const branding = useBranding();

  // Track ViewContent on mount (skip in editor preview)
  useEffect(() => {
    if (isEditorPreview()) return;
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
  }, [event, trackViewContent]);

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

  // WeeZTix ID mapping from settings (for checkout URL generation)
  const isWeeZTix = event.payment_method === "weeztix";
  const weeztixIds = useMemo(() => {
    if (!isWeeZTix || !settings) return undefined;
    const map: Record<number, string> = {};
    if (settings.ticketId1) map[0] = settings.ticketId1 as string;
    if (settings.ticketId2) map[1] = settings.ticketId2 as string;
    if (settings.ticketId3) map[2] = settings.ticketId3 as string;
    if (settings.ticketId4) map[3] = settings.ticketId4 as string;
    return Object.keys(map).length > 0 ? map : undefined;
  }, [isWeeZTix, settings]);

  const weeztixSizeIds = useMemo(() => {
    if (!isWeeZTix || !settings) return undefined;
    const map: Record<string, string> = {};
    if (settings.sizeIdXS) map["XS"] = settings.sizeIdXS as string;
    if (settings.sizeIdS) map["S"] = settings.sizeIdS as string;
    if (settings.sizeIdM) map["M"] = settings.sizeIdM as string;
    if (settings.sizeIdL) map["L"] = settings.sizeIdL as string;
    if (settings.sizeIdXL) map["XL"] = settings.sizeIdXL as string;
    if (settings.sizeIdXXL) map["XXL"] = settings.sizeIdXXL as string;
    return Object.keys(map).length > 0 ? map : undefined;
  }, [isWeeZTix, settings]);

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
                onCartChange={handleCartChange}
                onCheckoutReady={handleCheckoutReady}
                ticketGroups={ticketGroups}
                ticketGroupMap={ticketGroupMap}
                weeztixIds={weeztixIds}
                weeztixSizeIds={weeztixSizeIds}
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
