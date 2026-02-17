"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { DiscountPopup } from "@/components/event/DiscountPopup";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { useEventTracking } from "@/hooks/useEventTracking";
import { useCart } from "@/hooks/useCart";
import { useSettings } from "@/hooks/useSettings";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { MidnightHero } from "./MidnightHero";
import { MidnightEventInfo } from "./MidnightEventInfo";
import { MidnightLineup } from "./MidnightLineup";
import { MidnightTicketWidget } from "./MidnightTicketWidget";
import { MidnightMerchModal } from "./MidnightMerchModal";
import { MidnightBottomBar } from "./MidnightBottomBar";
import { MidnightSocialProof } from "./MidnightSocialProof";
import { MidnightFooter } from "./MidnightFooter";
import type { Event, TicketTypeRow } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface MidnightEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

export function MidnightEventPage({ event }: MidnightEventPageProps) {
  const tracking = useEventTracking();
  const { settings } = useSettings();
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
    const minPrice =
      ids.length > 0
        ? Math.min(
            ...(event.ticket_types || [])
              .filter((tt) => tt.status === "active")
              .map((tt) => Number(tt.price))
          )
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

  const handleTeeAdd = useCallback(
    (size: string, qty: number) => {
      if (teeModalTicketType) {
        cart.addMerchExternal(teeModalTicketType.id, size, qty);
      }
    },
    [teeModalTicketType, cart.addMerchExternal]
  );

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

  const currSymbol =
    event.currency === "GBP" ? "\u00a3" : event.currency === "EUR" ? "\u20ac" : "$";

  const lineup = event.lineup || [];

  const ticketGroups = (settings?.ticket_groups as string[] | undefined) || [];
  const ticketGroupMap =
    (settings?.ticket_group_map as Record<string, string | null> | undefined) || {};

  return (
    <>
      {/* Navigation */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <Header />
      </header>

      <main className="pt-[var(--header-height)] bg-background min-h-screen">
        <MidnightHero
          title={event.name.toUpperCase()}
          date={dateDisplay}
          doors={doorsDisplay}
          location={locationDisplay}
          age={event.age_restriction || "18+"}
          bannerImage={heroImage}
          tag={event.tag_line || ""}
        />

        <section className="relative z-10 pt-16 pb-16 max-lg:-mt-16 max-lg:pt-0 max-md:-mt-20 max-md:pb-10">
          <div className="max-w-[1200px] mx-auto px-6 max-md:px-0">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-20 max-lg:gap-8">
              {/* Left: Event Info — on mobile, show below tickets */}
              <div className="max-lg:order-2 max-lg:px-6 max-lg:pb-20 max-lg:flex max-lg:flex-col">
                {/* Lineup moves above About on mobile via order */}
                {lineup.length > 0 && (
                  <div className="lg:hidden order-[-1] mb-10 max-md:mb-8">
                    <MidnightLineup
                      artists={lineup}
                      onArtistClick={() => tracking.trackEngagement("click_lineup")}
                    />
                  </div>
                )}

                <MidnightEventInfo
                  aboutText={event.about_text}
                  detailsText={event.details_text}
                  description={event.description}
                />

                {/* Desktop lineup */}
                {lineup.length > 0 && (
                  <div className="hidden lg:block mt-14">
                    <MidnightLineup
                      artists={lineup}
                      onArtistClick={() => tracking.trackEngagement("click_lineup")}
                    />
                  </div>
                )}
              </div>

              {/* Right: Ticket Widget — on mobile, show first */}
              <div className="max-lg:order-1">
                <MidnightTicketWidget
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
          </div>
        </section>
      </main>

      <MidnightFooter />

      {/* Merch Modal — data-driven from ticket type config */}
      {teeModalTicketType && (
        <MidnightMerchModal
          isOpen={teeModalOpen}
          onClose={() => setTeeModalOpen(false)}
          onAddToCart={handleTeeAdd}
          merchName={
            (teeModalTicketType.product_id && teeModalTicketType.product
              ? teeModalTicketType.product.name
              : teeModalTicketType.merch_name) ||
            (teeModalTicketType.merch_type
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

      {/* Bottom bar — mobile only */}
      <MidnightBottomBar
        fromPrice={`${currSymbol}${cart.minPrice.toFixed(2)}`}
        cartTotal={cart.totalQty > 0 ? `${currSymbol}${cart.totalPrice.toFixed(2)}` : undefined}
        cartQty={cart.totalQty}
        cartItems={cart.cartItems}
        onBuyNow={() =>
          document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        onCheckout={cart.totalQty > 0 ? cart.handleCheckout : undefined}
      />

      {/* Engagement features */}
      <DiscountPopup />
      <EngagementTracker />
      <MidnightSocialProof />
    </>
  );
}
