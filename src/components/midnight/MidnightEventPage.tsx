"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { DiscountPopup } from "@/components/event/DiscountPopup";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { useEventTracking } from "@/hooks/useEventTracking";
import { useCart } from "@/hooks/useCart";
import { useSettings } from "@/hooks/useSettings";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { Button } from "@/components/ui/button";
import { MidnightHero } from "./MidnightHero";
import { MidnightEventInfo } from "./MidnightEventInfo";
import { MidnightLineup } from "./MidnightLineup";
import { MidnightTicketWidget } from "./MidnightTicketWidget";
import { MidnightMerchModal } from "./MidnightMerchModal";

import { MidnightCartToast } from "./MidnightCartToast";
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

  // Toast state — unique key triggers re-render of toast component
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastCounter = useRef(0);
  const showToast = useCallback((msg: string) => {
    toastCounter.current += 1;
    setToastMessage(`${msg}\x00${toastCounter.current}`);
  }, []);

  // Watch cart items for additions → trigger toast
  const prevCartLength = useRef(0);
  useEffect(() => {
    const len = cart.cartItems.length;
    if (len > prevCartLength.current && cart.cartItems.length > 0) {
      const newest = cart.cartItems[cart.cartItems.length - 1];
      const sizeInfo = newest.size ? ` (${newest.size})` : "";
      showToast(`${newest.name}${sizeInfo} added`);
    }
    prevCartLength.current = len;
  }, [cart.cartItems, showToast]);

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

      {/* Fixed bottom bar — mobile checkout CTA */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[997] lg:hidden midnight-bottom-bar transition-transform duration-300 ease-out ${
          cart.totalQty > 0 ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="font-[family-name:var(--font-sans)] text-[10px] font-medium tracking-[0.06em] uppercase text-foreground/40">
                {cart.totalQty} {cart.totalQty === 1 ? "ticket" : "tickets"}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-foreground tracking-[0.02em]">
                {currSymbol}{cart.totalPrice.toFixed(2)}
              </span>
            </div>
            <Button
              size="lg"
              className="px-8 text-sm font-bold tracking-[0.02em] rounded-xl shrink-0"
              onClick={cart.handleCheckout}
            >
              Checkout
            </Button>
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

      {/* Cart feedback toast */}
      <MidnightCartToast message={toastMessage} />

      {/* Engagement features */}
      <DiscountPopup />
      <EngagementTracker />
      <MidnightSocialProof />
    </>
  );
}
