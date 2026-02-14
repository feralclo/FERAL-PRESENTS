"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AuroraHero } from "./AuroraHero";
import { AuroraTrustBar } from "./AuroraTrustBar";
import { AuroraLineup } from "./AuroraLineup";
import { AuroraEventInfo } from "./AuroraEventInfo";
import { AuroraTicketWidget } from "./AuroraTicketWidget";
import { AuroraBottomBar } from "./AuroraBottomBar";
import { AuroraMerchModal } from "./AuroraMerchModal";
import { AuroraFooter } from "./AuroraFooter";
import { DiscountPopup } from "@/components/event/DiscountPopup";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { SocialProofToast } from "@/components/event/SocialProofToast";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import "@/styles/aurora.css";
import "@/styles/aurora-effects.css";
import type { Event, TicketTypeRow } from "@/types/events";

interface AuroraEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

export function AuroraEventPage({ event }: AuroraEventPageProps) {
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

  // Cart state from ticket widget
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

  // Merch modal
  const [teeModalOpen, setTeeModalOpen] = useState(false);
  const [teeModalTicketType, setTeeModalTicketType] = useState<TicketTypeRow | null>(null);

  const handleViewMerch = useCallback((tt: TicketTypeRow) => {
    setTeeModalTicketType(tt);
    setTeeModalOpen(true);
  }, []);

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

  const locationDisplay = [event.venue_name, event.city].filter(Boolean).join(", ");
  const doorsDisplay = event.doors_time || "";

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

  const lineup = event.lineup || [];

  // Ticket group data from settings
  const ticketGroups = (settings?.ticket_groups as string[] | undefined) || [];
  const ticketGroupMap = (settings?.ticket_group_map as Record<string, string | null> | undefined) || {};

  return (
    <>
      {/* Hero */}
      <AuroraHero
        title={event.name.toUpperCase()}
        date={dateDisplay}
        dateRaw={event.date_start}
        doors={doorsDisplay}
        location={locationDisplay}
        age={event.age_restriction || "18+"}
        bannerImage={heroImage}
        tagLine={event.tag_line || ""}
      />

      {/* Trust Bar */}
      <AuroraTrustBar />

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Left: Event Info */}
          <div className="lg:col-span-3 space-y-8">
            {/* Lineup */}
            {lineup.length > 0 && (
              <AuroraLineup artists={lineup} />
            )}

            {/* Event Info (About, Details, Venue) */}
            <AuroraEventInfo
              aboutText={event.about_text}
              detailsText={event.details_text}
              description={event.description}
              venueName={event.venue_name}
              venueAddress={event.venue_address}
              city={event.city}
            />
          </div>

          {/* Right: Ticket Widget */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6">
              <AuroraTicketWidget
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
        </div>
      </main>

      {/* Bottom Bar (mobile) */}
      <AuroraBottomBar
        fromPrice={`${currSymbol}${minPrice % 1 === 0 ? minPrice : minPrice.toFixed(2)}`}
        cartTotal={cartQty > 0 ? `${currSymbol}${cartTotal.toFixed(2)}` : undefined}
        cartQty={cartQty}
        onBuyNow={scrollToTickets}
        onCheckout={checkoutFn ?? undefined}
      />

      {/* Footer */}
      <AuroraFooter />

      {/* Merch Modal */}
      {teeModalTicketType && (
        <AuroraMerchModal
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
          vipBadge={`Includes ${teeModalTicketType.name}`}
        />
      )}

      {/* Engagement features (reused from existing) */}
      <DiscountPopup />
      <EngagementTracker />
      <SocialProofToast />

      {/* Mobile bottom padding */}
      <div className="h-20 md:hidden" />
    </>
  );
}
