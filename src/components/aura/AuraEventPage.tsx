"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useSettings } from "@/hooks/useSettings";
import { useBranding } from "@/hooks/useBranding";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { normalizeMerchImages } from "@/lib/merch-images";
import { DiscountPopup } from "@/components/event/DiscountPopup";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { Separator } from "@/components/ui/separator";
import { getAnnouncementState } from "@/lib/announcement";
import { AuraHeader } from "./AuraHeader";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { AuraHero } from "./AuraHero";
import { AuraTrustBar } from "./AuraTrustBar";
import { AuraLineup } from "./AuraLineup";
import { AuraEventInfo } from "./AuraEventInfo";
import { AuraTicketWidget } from "./AuraTicketWidget";
import { AuraAnnouncementWidget } from "./AuraAnnouncementWidget";
import { AuraBottomBar } from "./AuraBottomBar";
import { AuraMerchModal } from "./AuraMerchModal";
import { AuraFooter } from "./AuraFooter";
import { AuraSocialProof } from "./AuraSocialProof";
import type { Event, TicketTypeRow } from "@/types/events";
import type { EventArtist } from "@/types/artists";

import "@/styles/aura.css";
import "@/styles/aura-effects.css";

interface AuraEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[]; event_artists?: EventArtist[] };
}

const CURR_SYMBOL: Record<string, string> = { GBP: "\u00A3", EUR: "\u20AC", USD: "$" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AuraEventPage({ event }: AuraEventPageProps) {
  const { trackPageView, trackViewContent } = useMetaTracking();
  const { settings } = useSettings();
  const branding = useBranding();

  // Preview mode: ?preview=tickets bypasses announcement mode
  const [isTicketPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("preview") === "tickets";
  });

  // Cart state
  const [cartTotal, setCartTotal] = useState(0);
  const [cartQty, setCartQty] = useState(0);
  const [cartItems, setCartItems] = useState<{ name: string; qty: number; size?: string }[]>([]);
  const [checkoutFn, setCheckoutFn] = useState<(() => void) | null>(null);

  // Merch modal state
  const [teeModalTicketType, setTeeModalTicketType] = useState<TicketTypeRow | null>(null);
  const addMerchRef = useRef<((ticketTypeId: string, size: string, qty: number) => void) | null>(null);

  // Computed event data
  const activeTypes = useMemo(
    () => (event.ticket_types || []).filter((tt) => tt.status === "active"),
    [event.ticket_types]
  );

  const currSymbol = CURR_SYMBOL[event.currency || "GBP"] || "$";
  const minPrice = useMemo(
    () => activeTypes.length > 0 ? Math.min(...activeTypes.map((tt) => tt.price)) : 0,
    [activeTypes]
  );

  const dateDisplay = useMemo(() => {
    if (!event.date_start) return "";
    const d = new Date(event.date_start);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [event.date_start]);

  const heroImage = event.hero_image || event.cover_image || (event.id ? `/api/media/event_${event.id}_banner` : undefined);
  const location = [event.venue_name, event.city].filter(Boolean).join(", ");
  // Announcement / coming soon state
  const { isAnnouncement, ticketsLiveAt } = getAnnouncementState(event);

  const ticketGroups = (settings?.ticket_groups as string[]) || undefined;
  const ticketGroupMap = (settings?.ticket_group_map as Record<string, string | null>) || undefined;
  const ticketGroupReleaseMode = (settings?.ticket_group_release_mode as Record<string, "all" | "sequential">) || undefined;

  // Meta tracking on mount — PageView + ViewContent
  useEffect(() => {
    if (isEditorPreview()) return;
    trackPageView();
    if (activeTypes.length === 0) return;
    trackViewContent({
      content_name: event.name,
      content_ids: activeTypes.map((tt) => tt.id),
      content_type: "product",
      value: minPrice,
      currency: event.currency || "GBP",
    });
  }, [event.name, activeTypes, minPrice, event.currency, trackPageView, trackViewContent]);

  // Callbacks
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

  // Merch modal data
  const merchData = useMemo(() => {
    if (!teeModalTicketType) return null;
    const product = teeModalTicketType.product;
    return {
      name: teeModalTicketType.merch_name || product?.name || "Merchandise",
      description: teeModalTicketType.merch_description || product?.description || "",
      images: normalizeMerchImages(
        teeModalTicketType.product_id && product
          ? product.images
          : teeModalTicketType.merch_images
      ),
      price: teeModalTicketType.price,
      sizes: teeModalTicketType.merch_sizes || product?.sizes || ["XS", "S", "M", "L", "XL", "XXL"],
    };
  }, [teeModalTicketType]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <VerifiedBanner />
      <AuraHeader eventName={event.name} />

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pb-24 md:pb-12">
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
          fromPrice={activeTypes.length > 0 ? `${currSymbol}${minPrice.toFixed(2)}` : undefined}
        />

        <Separator className="my-10" />

        {/* Preview mode banner */}
        {isTicketPreview && isAnnouncement && (
          <div className="rounded-lg bg-gradient-to-r from-amber-600/90 via-amber-500/90 to-amber-600/90 text-white text-center py-2 px-4 text-xs tracking-wide mb-6">
            Preview Mode — Ticket page preview (not live yet)
          </div>
        )}

        {/* Tickets — widget provides its own heading, or Announcement widget */}
        <section id="tickets" className="scroll-mt-20">
          {isAnnouncement && ticketsLiveAt && !isTicketPreview ? (
            <AuraAnnouncementWidget
              eventId={event.id}
              ticketsLiveAt={ticketsLiveAt}
              title={event.announcement_title}
              subtitle={event.announcement_subtitle}
            />
          ) : (
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
              ticketGroupReleaseMode={ticketGroupReleaseMode}
              onViewMerch={handleViewMerch}
              addMerchRef={addMerchRef}
            />
          )}
        </section>

        <Separator className="my-10" />

        {/* About */}
        <section id="about" className="scroll-mt-20">
          <h2 className="text-lg font-semibold tracking-tight mb-5">About</h2>
          <AuraEventInfo
            aboutText={event.about_text}
            detailsText={event.details_text}
            description={event.description}
            venue={event.venue_name}
            venueAddress={event.venue_address}
          />
        </section>

        {/* Lineup */}
        {(() => {
          const ea = event.event_artists;
          const lineup = ea && ea.length > 0
            ? ea.sort((a, b) => a.sort_order - b.sort_order).map((e) => e.artist?.name).filter(Boolean) as string[]
            : event.lineup || [];
          return lineup.length > 0 ? (
            <>
              <Separator className="my-10" />
              <section id="lineup" className="scroll-mt-20">
                <h2 className="text-lg font-semibold tracking-tight mb-5">Lineup</h2>
                <AuraLineup artists={lineup} />
              </section>
            </>
          ) : null;
        })()}

        <Separator className="my-10" />

        <AuraTrustBar />
      </main>

      <AuraFooter />

      {/* Mobile bottom bar — hidden in announcement mode */}
      {!isAnnouncement && (
        <AuraBottomBar
          fromPrice={`${currSymbol}${minPrice.toFixed(2)}`}
          cartTotal={cartQty > 0 ? `${currSymbol}${cartTotal.toFixed(2)}` : undefined}
          cartQty={cartQty}
          onBuyNow={() => document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" })}
          onCheckout={checkoutFn || undefined}
        />
      )}

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

      <DiscountPopup />
      <EngagementTracker />
      <AuraSocialProof />
    </div>
  );
}
