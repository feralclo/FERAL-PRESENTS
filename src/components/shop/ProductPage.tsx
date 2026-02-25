"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useShopCart } from "@/hooks/useShopCart";
import { normalizeMerchImages } from "@/lib/merch-images";
import { getCurrencySymbol } from "@/lib/stripe/config";
import { MerchCheckout } from "./MerchCheckout";
import type { MerchCollection, MerchCollectionItem } from "@/types/merch-store";
import type { Event } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface ProductPageProps {
  item: MerchCollectionItem;
  collection: MerchCollection;
}

export function ProductPage({ item, collection }: ProductPageProps) {
  const headerHidden = useHeaderScroll();
  const product = item.product;
  const event = collection.event as Event | undefined;
  const currency = event?.currency || "GBP";
  const currSymbol = getCurrencySymbol(currency);
  const cart = useShopCart(currency);

  const images = product ? normalizeMerchImages(product.images) : [];
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const price = item.custom_price ?? product?.price ?? 0;
  const hasSizes = product?.sizes && product.sizes.length > 0;
  const canAdd = !hasSizes || selectedSize !== null;

  // Touch swipe for image gallery
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return;
      const diff = touchStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && selectedImage < images.length - 1) {
          setSelectedImage((p) => p + 1);
        } else if (diff < 0 && selectedImage > 0) {
          setSelectedImage((p) => p - 1);
        }
      }
      setTouchStart(null);
    },
    [touchStart, selectedImage, images.length]
  );

  const handleAddToCart = useCallback(() => {
    if (!canAdd) return;
    cart.addItem(item, selectedSize || undefined);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  }, [canAdd, cart, item, selectedSize]);

  if (!product) return null;

  // Checkout view
  if (showCheckout && event) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark,#0e0e0e)]">
        <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
          <VerifiedBanner />
          <Header />
        </header>
        <MerchCheckout
          collection={collection}
          event={event}
          cartItems={cart.items}
          totalPrice={cart.totalPrice}
          currency={currency}
          onBack={() => setShowCheckout(false)}
        />
        <MidnightFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-dark,#0e0e0e)]">
      {/* Header */}
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
        <VerifiedBanner />
        <Header />
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 pt-24 pb-28 sm:px-6 sm:pt-28 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary,#888)]">
            <Link
              href={`/shop/${collection.slug}/`}
              className="transition-colors hover:text-[var(--text-primary,#fff)]"
            >
              &larr; {collection.title}
            </Link>
          </div>
        </nav>

        {/* Two-column layout */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-10 xl:gap-14">
          {/* LEFT: Image gallery */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            {/* Main image */}
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {images.length > 0 ? (
                <img
                  src={images[selectedImage]}
                  alt={product.name}
                  className="h-full w-full object-cover transition-opacity duration-500"
                  key={selectedImage}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-6xl text-[var(--text-secondary,#888)]/10">&#9670;</span>
                </div>
              )}

              {/* Limited edition badge */}
              {item.is_limited_edition && (
                <div className="absolute top-4 left-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                    <span className="text-amber-400">&#9830;</span>
                    {item.limited_edition_label || collection.limited_edition_label || "Limited Edition"}
                  </span>
                </div>
              )}

              {/* Image counter dots (mobile) */}
              {images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 lg:hidden">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === selectedImage
                          ? "w-5 bg-[var(--text-primary,#fff)]"
                          : "w-1.5 bg-[var(--text-primary,#fff)]/30"
                      }`}
                      aria-label={`Image ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all lg:h-20 lg:w-20 lg:rounded-xl ${
                      i === selectedImage
                        ? "border-[var(--text-primary,#fff)]/50"
                        : "border-transparent opacity-40 hover:opacity-70"
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${product.name} ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Product info */}
          <div className="mt-6 lg:mt-0">
            {/* Type label */}
            <p className="text-[10px] uppercase tracking-[3px] text-[var(--text-secondary,#888)]/40">
              {product.type}
            </p>

            {/* Product name */}
            <h1 className="mt-1.5 font-[var(--font-mono,'Space_Mono',monospace)] text-xl font-bold leading-tight text-[var(--text-primary,#fff)] sm:text-2xl">
              {product.name}
            </h1>

            {/* Price */}
            {price > 0 && (
              <p className="mt-2 font-[var(--font-mono,'Space_Mono',monospace)] text-lg font-bold text-[var(--text-primary,#fff)]">
                {currSymbol}{Number(price).toFixed(2)}
              </p>
            )}

            {/* Description */}
            {product.description && (
              <>
                <div className="my-5 h-px bg-gradient-to-r from-[var(--text-secondary,#888)]/10 via-[var(--text-secondary,#888)]/10 to-transparent" />
                <p className="text-[14px] leading-relaxed text-[var(--text-secondary,#888)]/70 whitespace-pre-line">
                  {product.description}
                </p>
              </>
            )}

            {/* Size selector */}
            {hasSizes && (
              <div className="mt-6">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]/60">
                    Size
                  </p>
                  {selectedSize && (
                    <p className="text-[11px] text-[var(--text-secondary,#888)]/50">
                      {selectedSize}
                    </p>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size === selectedSize ? null : size)}
                      className={`min-w-[44px] rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-all touch-manipulation ${
                        size === selectedSize
                          ? "border-[var(--text-primary,#fff)]/30 bg-[var(--text-primary,#fff)]/8 text-[var(--text-primary,#fff)]"
                          : "border-[var(--card-border,#2a2a2a)] text-[var(--text-secondary,#888)]/60 hover:border-[var(--text-secondary,#888)]/30 hover:text-[var(--text-primary,#fff)]"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to cart */}
            {price > 0 && (
              <div className="mt-6">
                <button
                  onClick={handleAddToCart}
                  disabled={!canAdd}
                  className={`w-full rounded-xl py-3.5 text-[13px] font-bold uppercase tracking-[2px] transition-all touch-manipulation disabled:cursor-not-allowed disabled:opacity-30 ${
                    addedFeedback
                      ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-400"
                      : canAdd
                        ? "border border-[var(--text-primary,#fff)]/10 bg-[var(--text-primary,#fff)]/8 text-[var(--text-primary,#fff)] hover:bg-[var(--text-primary,#fff)]/12"
                        : "border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] text-[var(--text-secondary,#888)]"
                  }`}
                  style={canAdd && !addedFeedback ? {
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px rgba(255,255,255,0.02)",
                  } : undefined}
                >
                  {addedFeedback
                    ? "Added"
                    : !canAdd
                      ? "Select a size"
                      : "Add to Cart"}
                </button>
              </div>
            )}

            {/* Compact info strip */}
            <div className="mt-6">
              <div className="rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]/60">
                {/* Collection info */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--text-primary,#fff)]/[0.04]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-secondary,#888)]/50">
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                      <path d="m3.3 7 8.7 5 8.7-5" />
                      <path d="M12 22V12" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-primary,#fff)]/80">
                      Pre-order &middot; Collect at event
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]/50">
                      {collection.pickup_instructions || "Present your QR code at the merch stand"}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div className="mx-4 h-px bg-[var(--card-border,#2a2a2a)]" />

                {/* Event info */}
                {event && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--text-primary,#fff)]/[0.04]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-secondary,#888)]/50">
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-[var(--text-primary,#fff)]/80">
                        {event.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-secondary,#888)]/50">
                        {event.date_start && (
                          <span>
                            {new Date(event.date_start).toLocaleDateString("en-GB", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                        {event.venue_name && (
                          <>
                            <span className="text-[var(--card-border,#2a2a2a)]">&middot;</span>
                            <span>{event.venue_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {event.slug && (
                      <Link
                        href={`/event/${event.slug}/`}
                        className="flex-shrink-0 text-[11px] font-medium text-[var(--text-secondary,#888)]/50 transition-colors hover:text-[var(--text-primary,#fff)]"
                      >
                        Tickets &rarr;
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Max per order notice */}
            {item.max_per_order && (
              <p className="mt-3 text-[11px] text-[var(--text-secondary,#888)]/40">
                Limit {item.max_per_order} per order
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Floating cart bar */}
      {cart.hasItems && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)]/95 backdrop-blur-lg safe-area-bottom">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--text-primary,#fff)]/8 text-[12px] font-bold text-[var(--text-primary,#fff)]/70">
                {cart.totalQty}
              </span>
              <div>
                <p className="text-[13px] font-medium text-[var(--text-primary,#fff)]">
                  {cart.currSymbol}{cart.totalPrice.toFixed(2)}
                </p>
                <p className="text-[11px] text-[var(--text-secondary,#888)]/50">
                  {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="rounded-xl px-6 py-2.5 text-[12px] font-bold uppercase tracking-[2px] transition-all touch-manipulation"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                color: "var(--text-primary, #fff)",
                border: "1px solid rgba(255, 255, 255, 0.10)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px rgba(255,255,255,0.02)",
              }}
            >
              Checkout
            </button>
          </div>
        </div>
      )}

      <MidnightFooter />
    </div>
  );
}
