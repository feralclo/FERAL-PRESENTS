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

  const currSymbol = cart.currSymbol;

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

        <section className="relative z-10 pt-16 pb-16 max-lg:-mt-[var(--midnight-hero-overlap)] max-lg:pt-0 max-md:pb-10 pointer-events-none">
          <div className="max-w-[1200px] mx-auto px-6 max-md:px-0 pointer-events-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-[var(--midnight-section-gap)]">
              {/* Left: Event Info — on mobile, show below tickets */}
              <div className="max-lg:order-2 max-lg:px-[var(--midnight-content-px)] max-lg:pb-24 max-lg:flex max-lg:flex-col">
                {/* Mobile section divider */}
                <div className="lg:hidden order-[-2] mb-16 max-[480px]:mb-12">
                  <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
                  <div className="h-8 bg-gradient-to-b from-foreground/[0.02] to-transparent" />
                </div>

                {/* Lineup on mobile (above about) */}
                {lineup.length > 0 && (
                  <div className="lg:hidden order-[-1] mb-12 max-md:mb-10">
                    <MidnightLineup artists={lineup} />
                  </div>
                )}

                <MidnightEventInfo
                  aboutText={event.about_text}
                  detailsText={event.details_text}
                  description={event.description}
                />

                {/* Desktop lineup */}
                {lineup.length > 0 && (
                  <div className="hidden lg:block mt-16">
                    <MidnightLineup artists={lineup} />
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

      {/* Fixed bottom bar — mobile checkout CTA
           Synced with header scroll: hides on scroll down, shows on scroll up.
           will-change + no backdrop-filter prevents Instagram in-app browser jank. */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[997] lg:hidden midnight-bottom-bar will-change-transform ${
          cart.totalQty > 0 && !headerHidden ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transition: "transform 400ms cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="px-5 pt-3.5 pb-[max(16px,calc(12px+env(safe-area-inset-bottom)))]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-[family-name:var(--font-mono)] text-[17px] font-bold text-foreground tracking-[0.01em]">
                {currSymbol}{cart.totalPrice.toFixed(2)}
              </span>
              <span className="font-[family-name:var(--font-sans)] text-[11px] text-foreground/35">
                {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
              </span>
            </div>
            <button
              type="button"
              className="h-11 px-7 text-[13px] font-bold tracking-[0.03em] rounded-xl shrink-0 bg-white text-[#0e0e0e] active:scale-[0.97] transition-transform duration-150 cursor-pointer"
              onClick={cart.handleCheckout}
            >
              Checkout
            </button>
          </div>
        </div>
      </div>

      {/* Merch Modal */}
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

      {/* Engagement features */}
      <DiscountPopup />
      <EngagementTracker />
    </>
  );
}
