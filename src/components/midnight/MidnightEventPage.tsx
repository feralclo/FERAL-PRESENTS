"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { MidnightDiscountPopup } from "./MidnightDiscountPopup";
import { EngagementTracker } from "@/components/event/EngagementTracker";
import { isEditorPreview } from "@/components/event/ThemeEditorBridge";
import { useEventTracking } from "@/hooks/useEventTracking";
import { useCart } from "@/hooks/useCart";
import { useSettings } from "@/hooks/useSettings";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { MidnightHero } from "./MidnightHero";
import { MidnightEventInfo } from "./MidnightEventInfo";
import { MidnightLineup } from "./MidnightLineup";
import { MidnightTicketWidget } from "./MidnightTicketWidget";
import { MidnightMerchModal } from "./MidnightMerchModal";
import { normalizeMerchImages } from "@/lib/merch-images";

import { MidnightArtistModal } from "./MidnightArtistModal";
import { MidnightFooter } from "./MidnightFooter";
import { isMuxPlaybackId, getMuxStreamUrl, getMuxThumbnailUrl } from "@/lib/mux";
import type { Event, TicketTypeRow } from "@/types/events";
import type { Artist, EventArtist } from "@/types/artists";
import type { DiscountDisplay } from "./discount-utils";
import { getDiscountAmount } from "./discount-utils";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface MidnightEventPageProps {
  event: Event & { ticket_types: TicketTypeRow[]; event_artists?: EventArtist[] };
}

export function MidnightEventPage({ event }: MidnightEventPageProps) {
  const tracking = useEventTracking();
  const { settings } = useSettings();
  const headerHidden = useHeaderScroll();
  const revealRef = useScrollReveal();

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

  // Preload merch images on page load so the modal opens instantly
  useEffect(() => {
    (event.ticket_types || []).forEach((tt) => {
      if (!tt.includes_merch) return;
      const imgs = tt.product_id && tt.product ? tt.product.images : tt.merch_images;
      normalizeMerchImages(imgs).forEach((src) => { const i = new Image(); i.src = src; });
    });
  }, [event.ticket_types]);

  // ── Discount display state ──────────────────────────────────────────
  const [activeDiscount, setActiveDiscount] = useState<DiscountDisplay | null>(null);

  // Validate popup discount code from sessionStorage
  useEffect(() => {
    function checkDiscount() {
      try {
        const code = sessionStorage.getItem("feral_popup_discount");
        if (!code || activeDiscount) return;
        fetch("/api/discounts/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, event_id: event.id }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.valid && data.discount) {
              setActiveDiscount({
                code: data.discount.code,
                type: data.discount.type,
                value: data.discount.value,
              });
            }
          })
          .catch(() => {});
      } catch {
        // sessionStorage unavailable
      }
    }

    // Check on mount (page reload with existing sessionStorage)
    checkDiscount();

    // Also check when popup stores a new discount code
    function handlePopupEmail() {
      checkDiscount();
    }
    window.addEventListener("feral_popup_email_captured", handlePopupEmail);
    return () => window.removeEventListener("feral_popup_email_captured", handlePopupEmail);
  }, [event.id, activeDiscount]);

  // ── Abandoned cart bridge ──────────────────────────────────────────
  // When popup captures email + cart has items → create abandoned cart
  const abandonedCartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function syncAbandonedCart() {
      try {
        const popupEmail = sessionStorage.getItem("feral_popup_email");
        if (!popupEmail || cart.totalQty === 0) return;

        // Build items from expressItems + ticket type lookups
        const ttMap = new Map(
          (event.ticket_types || []).map((tt) => [tt.id, tt])
        );
        const items = cart.expressItems.map((ei) => {
          const tt = ttMap.get(ei.ticket_type_id);
          return {
            ticket_type_id: ei.ticket_type_id,
            qty: ei.qty,
            name: tt?.name || "Ticket",
            price: tt ? Number(tt.price) : 0,
            merch_size: ei.merch_size,
          };
        });

        fetch("/api/checkout/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: popupEmail,
            event_id: event.id,
            items,
            subtotal: cart.totalPrice,
            currency: event.currency || "GBP",
          }),
        }).catch(() => {});
      } catch {
        // sessionStorage unavailable
      }
    }

    // Debounce: wait 2s after cart changes before syncing
    if (abandonedCartTimer.current) clearTimeout(abandonedCartTimer.current);
    abandonedCartTimer.current = setTimeout(syncAbandonedCart, 2000);

    return () => {
      if (abandonedCartTimer.current) clearTimeout(abandonedCartTimer.current);
    };
  }, [cart.totalQty, cart.totalPrice, cart.expressItems, event.id, event.ticket_types, event.currency]);

  // Also sync immediately when popup email is first captured
  useEffect(() => {
    function handlePopupCapture(e: globalThis.Event) {
      const detail = (e as unknown as CustomEvent<{ email: string }>).detail;
      if (!detail?.email || cart.totalQty === 0) return;

      const ttMap = new Map(
        (event.ticket_types || []).map((tt) => [tt.id, tt])
      );
      const items = cart.expressItems.map((ei) => {
        const tt = ttMap.get(ei.ticket_type_id);
        return {
          ticket_type_id: ei.ticket_type_id,
          qty: ei.qty,
          name: tt?.name || "Ticket",
          price: tt ? Number(tt.price) : 0,
          merch_size: ei.merch_size,
        };
      });

      fetch("/api/checkout/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: detail.email,
          event_id: event.id,
          items,
          subtotal: cart.totalPrice,
          currency: event.currency || "GBP",
        }),
      }).catch(() => {});
    }

    window.addEventListener("feral_popup_email_captured", handlePopupCapture);
    return () => window.removeEventListener("feral_popup_email_captured", handlePopupCapture);
  }, [cart.totalQty, cart.totalPrice, cart.expressItems, event.id, event.ticket_types, event.currency]);

  // Compute discounted total for bottom bar
  const discountedTotal = activeDiscount
    ? Math.max(0, Math.round((cart.totalPrice - getDiscountAmount(cart.totalPrice, activeDiscount)) * 100) / 100)
    : cart.totalPrice;

  // Artist profiles — build a name→Artist map for the lineup component
  const artistProfiles = useMemo(() => {
    const map = new Map<string, Artist>();
    const eventArtists = event.event_artists;
    if (eventArtists && eventArtists.length > 0) {
      for (const ea of eventArtists) {
        if (ea.artist) {
          map.set(ea.artist.name, ea.artist);
        }
      }
    }
    return map;
  }, [event.event_artists]);

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

  // Derive lineup: prefer event_artists (sorted), fall back to events.lineup
  const isAlphabetical = !!event.lineup_sort_alphabetical;
  const lineup = useMemo(() => {
    const ea = event.event_artists;
    if (ea && ea.length > 0) {
      const names = ea
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => e.artist?.name)
        .filter(Boolean) as string[];
      if (isAlphabetical) {
        return names.sort((a, b) => a.localeCompare(b));
      }
      return names;
    }
    const fallback = event.lineup || [];
    return isAlphabetical ? [...fallback].sort((a, b) => a.localeCompare(b)) : fallback;
  }, [event.event_artists, event.lineup, isAlphabetical]);

  // Ordered list of artists that have profiles (clickable in lineup)
  const artistsWithProfiles = useMemo(() => {
    const result: Artist[] = [];
    for (const name of lineup) {
      const profile = artistProfiles.get(name);
      if (profile) result.push(profile);
    }
    return result;
  }, [lineup, artistProfiles]);

  // Preload artist videos — fetch HLS manifests + first segments into
  // browser cache so MuxPlayer finds data ready when the modal opens.
  useEffect(() => {
    if (artistsWithProfiles.length === 0) return;
    const videos = artistsWithProfiles.filter(
      (a) => a.video_url && isMuxPlaybackId(a.video_url)
    );
    if (videos.length === 0) return;

    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 2000);

    const cancel =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : clearTimeout;

    const id = idle(() => {
      for (const a of videos) preloadMuxVideo(a.video_url!);
    });

    return () => cancel(id as number);
  }, [artistsWithProfiles]);

  // Artist modal state — index-based for swipe navigation
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [selectedArtistIndex, setSelectedArtistIndex] = useState(0);

  const handleArtistClick = useCallback((artist: Artist) => {
    const idx = artistsWithProfiles.findIndex((a) => a.id === artist.id);
    setSelectedArtistIndex(idx >= 0 ? idx : 0);
    setArtistModalOpen(true);
  }, [artistsWithProfiles]);

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

      <main ref={revealRef as React.RefObject<HTMLElement>} className="pt-[var(--header-height)] bg-background min-h-screen">
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
                {/* Mobile section divider — single gradient line */}
                <div className="lg:hidden order-[-2] mb-14 max-[480px]:mb-10 pt-6 max-[480px]:pt-5">
                  <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
                </div>

                {/* Lineup on mobile (above about) */}
                {lineup.length > 0 && (
                  <div className="lg:hidden order-[-1] mb-12 max-md:mb-10" data-reveal="1">
                    <MidnightLineup artists={lineup} isAlphabetical={isAlphabetical} artistProfiles={artistProfiles} onArtistClick={handleArtistClick} />
                  </div>
                )}

                <div data-reveal="2">
                  <MidnightEventInfo
                    aboutText={event.about_text}
                    detailsText={event.details_text}
                    description={event.description}
                  />
                </div>

                {/* Desktop lineup */}
                {lineup.length > 0 && (
                  <div className="hidden lg:block mt-16" data-reveal="3">
                    <MidnightLineup artists={lineup} isAlphabetical={isAlphabetical} artistProfiles={artistProfiles} onArtistClick={handleArtistClick} />
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
                  discount={activeDiscount}
                  onApplyDiscount={setActiveDiscount}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <MidnightFooter />

      {/* Fixed bottom bar — mobile checkout CTA
           Synced with header scroll: hides on scroll down, shows on scroll up.
           will-change + no backdrop-filter prevents Instagram in-app browser jank.
           Controlled via admin Event Page settings (sticky_checkout_bar). */}
      {settings?.sticky_checkout_bar !== false && (
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
                  {currSymbol}{discountedTotal.toFixed(2)}
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
      )}

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
          ticketName={teeModalTicketType.name}
          ticketDescription={teeModalTicketType.description}
          vipBadge={`Includes ${teeModalTicketType.name} \u2014 ${event.name}`}
        />
      )}

      {/* Artist Profile Modal */}
      <MidnightArtistModal
        artists={artistsWithProfiles}
        currentIndex={selectedArtistIndex}
        isOpen={artistModalOpen}
        onClose={() => setArtistModalOpen(false)}
        onNavigate={setSelectedArtistIndex}
      />

      {/* Engagement features */}
      <MidnightDiscountPopup />
      <EngagementTracker />
    </>
  );
}

/**
 * Lightweight preload — fetch HLS master manifest + thumbnail only.
 * Manifests are ~1KB, thumbnails ~20KB. No segment fetching here —
 * that would compete with MuxPlayer for bandwidth and cause video
 * freezes. The actual video prebuffering happens via a hidden
 * MuxPlayer instance in the artist modal.
 */
async function preloadMuxVideo(playbackId: string) {
  try {
    const img = new Image();
    img.src = getMuxThumbnailUrl(playbackId);
    await fetch(getMuxStreamUrl(playbackId));
  } catch {
    // Best-effort — silent fail
  }
}
