"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { DiscountPopup } from "@/components/event/DiscountPopup";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { AuraHero } from "./AuraHero";
import { AuraTrustBar } from "./AuraTrustBar";
import { AuraLineup } from "./AuraLineup";
import { AuraEventInfo } from "./AuraEventInfo";
import { AuraTicketWidget } from "./AuraTicketWidget";
import { AuraBottomBar } from "./AuraBottomBar";
import { AuraMerchModal } from "./AuraMerchModal";
import { AuraFooter } from "./AuraFooter";
import { AuraSocialProof } from "./AuraSocialProof";
import type { Event, TicketTypeRow } from "@/types/events";

import "@/styles/aura.css";
import "@/styles/aura-effects.css";

interface AuraEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
}

const CURR_SYMBOL: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AuraEventPage({ event }: AuraEventPageProps) {
  const { trackViewContent } = useMetaTracking();
  const { settings } = useSettings();
  const branding = useBranding();

  // ── Cart state ──
  const [cartTotal, setCartTotal] = useState(0);
  const [cartQty, setCartQty] = useState(0);
  const [cartItems, setCartItems] = useState<{ name: string; qty: number; size?: string }[]>([]);
  const [checkoutFn, setCheckoutFn] = useState<(() => void) | null>(null);

  // ── Merch modal state ──
  const [teeModalTicketType, setTeeModalTicketType] = useState<TicketTypeRow | null>(null);
  const addMerchRef = useRef<((ticketTypeId: string, size: string, qty: number) => void) | null>(null);

  // ── Computed event data ──
  const activeTypes = useMemo(
    () => (event.ticket_types || []).filter((tt) => tt.status === "active"),
    [event.ticket_types]
  );

  const currSymbol = CURR_SYMBOL[event.currency || "GBP"] || "$";
  const minPrice = useMemo(
    () => activeTypes.length > 0 ? Math.min(...activeTypes.map((tt) => tt.price)) : 0,
    [activeTypes]
  );

  // Format date
  const dateDisplay = useMemo(() => {
    if (!event.date_start) return "";
    const d = new Date(event.date_start);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [event.date_start]);

  // Hero image
  const heroImage = event.hero_image || event.cover_image || (event.id ? `/api/media/event_${event.id}_banner` : undefined);

  // Location
  const location = [event.venue_name, event.city].filter(Boolean).join(", ");

  // Ticket groups from settings
  const ticketGroups = (settings?.ticket_groups as string[]) || undefined;
  const ticketGroupMap = (settings?.ticket_group_map as Record<string, string | null>) || undefined;

  // ── Meta tracking on mount ──
  useEffect(() => {
    if (isEditorPreview()) return;
    if (activeTypes.length === 0) return;
    trackViewContent({
      content_name: event.name,
      content_ids: activeTypes.map((tt) => tt.id),
      content_type: "product",
      value: minPrice,
      currency: event.currency || "GBP",
    });
  }, [event.name, activeTypes, minPrice, event.currency, trackViewContent]);

  // ── Callbacks ──
  const handleCartChange = useCallback(
    (total: number, qty: number, items: { name: string; qty: number; size?: string }[]) => {
      setCartTotal(total);
      setCartQty(qty);
      setCartItems(items);
    },
    []
  );

  const handleCheckoutReady = useCallback((fn: () => void) => {
    setCheckoutFn(() => fn || null);
  }, []);

  const handleViewMerch = useCallback((tt: TicketTypeRow) => {
    setTeeModalTicketType(tt);
  }, []);

  const handleTeeAdd = useCallback(
    (size: string, qty: number) => {
      if (teeModalTicketType && addMerchRef.current) {
        addMerchRef.current(teeModalTicketType.id, size, qty);
      }
    },
    [teeModalTicketType]
  );

  const scrollToTickets = useCallback(() => {
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Merch modal data ──
  const merchData = useMemo(() => {
    if (!teeModalTicketType) return null;
    const product = teeModalTicketType.product;
    return {
      name: teeModalTicketType.merch_name || product?.name || "Merchandise",
      description: teeModalTicketType.merch_description || product?.description || "",
      images: {
        front: (teeModalTicketType.merch_images as { front?: string; back?: string })?.front
          || (product?.images as string[])?.[0],
        back: (teeModalTicketType.merch_images as { front?: string; back?: string })?.back
          || (product?.images as string[])?.[1],
      },
      price: teeModalTicketType.price,
      sizes: teeModalTicketType.merch_sizes || product?.sizes || ["XS", "S", "M", "L", "XL", "XXL"],
    };
  }, [teeModalTicketType]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <AuraHero
        title={event.name}
        date={dateDisplay}
        dateRaw={event.date_start}
        doors={event.doors_time || "TBA"}
        location={location || "TBA"}
        age={event.age_restriction || "18+"}
        bannerImage={heroImage}
        tagLine={event.tag_line}
      />

      {/* Trust bar */}
      <AuraTrustBar />

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-24 md:pb-12">
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Left column — event info */}
          <div className="lg:col-span-3 space-y-8">
            {/* Lineup */}
            <AuraLineup artists={event.lineup || []} />

            {/* Event info */}
            <AuraEventInfo
              aboutText={event.about_text}
              detailsText={event.details_text}
              description={event.description}
              venue={event.venue_name}
              venueAddress={event.venue_address}
            />
          </div>

          {/* Right column — tickets (sticky) */}
          <div className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
            <AuraTicketWidget
              eventSlug={event.slug}
              eventId={event.id}
              paymentMethod={event.payment_method}
              ticketTypes={event.ticket_types || []}
              currency={event.currency || "GBP"}
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

      {/* Footer */}
      <AuraFooter />

      {/* Mobile bottom bar */}
      <AuraBottomBar
        fromPrice={`${currSymbol}${minPrice.toFixed(2)}`}
        cartTotal={cartQty > 0 ? `${currSymbol}${cartTotal.toFixed(2)}` : undefined}
        cartQty={cartQty}
        onBuyNow={scrollToTickets}
        onCheckout={checkoutFn || undefined}
      />

      {/* Merch modal */}
      {merchData && (
        <AuraMerchModal
          isOpen={!!teeModalTicketType}
          onClose={() => setTeeModalTicketType(null)}
          onAddToCart={handleTeeAdd}
          merchName={merchData.name}
          merchDescription={merchData.description}
          merchImages={merchData.images}
          merchPrice={merchData.price}
          currencySymbol={currSymbol}
          availableSizes={merchData.sizes}
          vipBadge={`Includes ${teeModalTicketType?.name || "Ticket"}`}
        />
      )}

      {/* Engagement features */}
      <DiscountPopup />
      <EngagementTracker />
      <AuraSocialProof />
    </div>
  );
}
