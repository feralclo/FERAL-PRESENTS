"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useShopCart } from "@/hooks/useShopCart";
import { normalizeMerchImages } from "@/lib/merch-images";
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
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-24 sm:px-6 sm:pt-32 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary,#888)]">
            <Link
              href="/shop/"
              className="transition-colors hover:text-[var(--text-primary,#fff)]"
            >
              Shop
            </Link>
            <span className="text-[var(--text-secondary,#888)]/30">/</span>
            <Link
              href={`/shop/${collection.slug}/`}
              className="transition-colors hover:text-[var(--text-primary,#fff)]"
            >
              {collection.title}
            </Link>
            <span className="text-[var(--text-secondary,#888)]/30">/</span>
            <span className="text-[var(--text-primary,#fff)]">{product.name}</span>
          </div>
        </nav>

        {/* Two-column layout */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-12 xl:gap-16">
          {/* LEFT: Image gallery */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            {/* Main image */}
            <div
              className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]"
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

              {/* Image counter (mobile) */}
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

            {/* Thumbnail strip (desktop) */}
            {images.length > 1 && (
              <div className="mt-3 hidden gap-2 lg:flex">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                      i === selectedImage
                        ? "border-[var(--text-primary,#fff)]/60 shadow-lg"
                        : "border-transparent opacity-50 hover:opacity-80"
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

            {/* Thumbnail strip (mobile — horizontal scroll) */}
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                      i === selectedImage
                        ? "border-[var(--text-primary,#fff)]/60"
                        : "border-transparent opacity-50"
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
          <div className="mt-8 lg:mt-0">
            {/* Type label */}
            <p className="text-[11px] uppercase tracking-[3px] text-[var(--text-secondary,#888)]/50">
              {product.type}
            </p>

            {/* Product name */}
            <h1 className="mt-2 font-[var(--font-mono,'Space_Mono',monospace)] text-2xl font-bold leading-tight text-[var(--text-primary,#fff)] sm:text-3xl">
              {product.name}
            </h1>

            {/* Price */}
            {price > 0 && (
              <p className="mt-3 font-[var(--font-mono,'Space_Mono',monospace)] text-2xl font-bold text-[var(--text-primary,#fff)]">
                £{Number(price).toFixed(2)}
              </p>
            )}

            {/* Gradient divider */}
            <div className="my-6 h-px bg-gradient-to-r from-transparent via-[var(--text-secondary,#888)]/15 to-transparent" />

            {/* Description */}
            {product.description && (
              <p className="text-[15px] leading-relaxed text-[var(--text-secondary,#888)] whitespace-pre-line">
                {product.description}
              </p>
            )}

            {/* Size selector */}
            {hasSizes && (
              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]">
                    Size
                  </p>
                  {selectedSize && (
                    <p className="text-[12px] text-[var(--text-secondary,#888)]">
                      Selected: <span className="font-medium text-[var(--text-primary,#fff)]">{selectedSize}</span>
                    </p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size === selectedSize ? null : size)}
                      className={`min-w-[48px] rounded-xl border px-4 py-2.5 text-sm font-medium transition-all touch-manipulation ${
                        size === selectedSize
                          ? "border-[var(--text-primary,#fff)]/40 bg-[var(--text-primary,#fff)]/10 text-[var(--text-primary,#fff)] shadow-[0_0_16px_rgba(255,255,255,0.04)]"
                          : "border-[var(--card-border,#2a2a2a)] text-[var(--text-secondary,#888)] hover:border-[var(--text-secondary,#888)]/40 hover:text-[var(--text-primary,#fff)]"
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
              <div className="mt-8">
                <button
                  onClick={handleAddToCart}
                  disabled={!canAdd}
                  className="w-full rounded-xl py-4 text-[13px] font-bold uppercase tracking-[2px] transition-all touch-manipulation disabled:cursor-not-allowed disabled:opacity-30"
                  style={{
                    backgroundColor: addedFeedback
                      ? "rgba(52, 211, 153, 0.15)"
                      : canAdd
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: addedFeedback
                      ? "#34D399"
                      : "var(--text-primary, #fff)",
                    border: addedFeedback
                      ? "1px solid rgba(52, 211, 153, 0.3)"
                      : "1px solid rgba(255, 255, 255, 0.10)",
                    boxShadow: canAdd && !addedFeedback
                      ? "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 20px rgba(255,255,255,0.03)"
                      : "none",
                  }}
                >
                  {addedFeedback
                    ? "Added to cart ✓"
                    : !canAdd
                      ? "Select a size"
                      : "Add to Cart"}
                </button>
              </div>
            )}

            {/* Gradient divider */}
            <div className="my-8 h-px bg-gradient-to-r from-transparent via-[var(--text-secondary,#888)]/15 to-transparent" />

            {/* Pre-order info */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]/60">
                Pre-order Info
              </p>

              {/* Collect at event */}
              <div className="rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-base leading-none">&#128230;</span>
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                      Collect at the Event
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary,#888)]">
                      {collection.pickup_instructions ||
                        "Present your QR code at the merch stand to collect your order."}
                    </p>
                  </div>
                </div>
              </div>

              {/* QR code */}
              <div className="rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-base leading-none">&#128274;</span>
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                      QR Code Confirmation
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary,#888)]">
                      After purchase, you&apos;ll receive a QR code via email.
                      Show it at the event to collect your merch.
                    </p>
                  </div>
                </div>
              </div>

              {/* Ticket required */}
              {event && (
                <div className="rounded-xl border border-[var(--accent,#ff0033)]/15 bg-[var(--accent,#ff0033)]/5 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-base leading-none">&#127915;</span>
                    <div>
                      <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                        Ticket Required for Collection
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary,#888)]">
                        You&apos;ll need a ticket to{" "}
                        <span className="font-medium text-[var(--text-primary,#fff)]">{event.name}</span>{" "}
                        to collect your merch.
                      </p>
                      <Link
                        href={`/event/${event.slug}/`}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent,#ff0033)] transition-colors hover:underline"
                      >
                        Get your ticket &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Event info */}
            {event && (
              <>
                <div className="my-8 h-px bg-gradient-to-r from-transparent via-[var(--text-secondary,#888)]/15 to-transparent" />
                <div className="rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]/60 mb-3">
                    Event
                  </p>
                  <p className="font-[var(--font-mono,'Space_Mono',monospace)] text-sm font-bold text-[var(--text-primary,#fff)]">
                    {event.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-secondary,#888)]">
                    {event.date_start && (
                      <span>
                        {new Date(event.date_start).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {event.venue_name && <span>{event.venue_name}</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Floating cart bar */}
      {cart.hasItems && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]/95 backdrop-blur-lg safe-area-bottom">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--text-primary,#fff)]/10 text-xs font-bold text-[var(--text-primary,#fff)]">
                {cart.totalQty}
              </span>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary,#fff)]">
                  {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
                </p>
                <p className="text-xs text-[var(--text-secondary,#888)]">
                  {cart.currSymbol}{cart.totalPrice.toFixed(2)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="rounded-xl px-6 py-2.5 text-[13px] font-bold uppercase tracking-wider transition-all touch-manipulation"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.10)",
                color: "var(--text-primary, #fff)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 20px rgba(255,255,255,0.03)",
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
