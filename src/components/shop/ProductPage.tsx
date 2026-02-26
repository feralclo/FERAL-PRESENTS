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
    setTimeout(() => setAddedFeedback(false), 1800);
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
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
        <VerifiedBanner />
        <Header />
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-24 pb-28 sm:px-6 sm:pt-28 lg:px-8">
        {/* Back link */}
        <nav className="mb-6">
          <Link
            href={`/shop/${collection.slug}/`}
            className="text-[12px] text-[var(--text-secondary,#888)]/50 transition-colors hover:text-[var(--text-primary,#fff)]"
          >
            &larr; {collection.title}
          </Link>
        </nav>

        <div className="lg:grid lg:grid-cols-2 lg:gap-10 xl:gap-14">
          {/* Image gallery */}
          <div className="lg:sticky lg:top-28 lg:self-start">
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
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--card-bg,#1a1a1a)] to-[var(--bg-dark,#0e0e0e)]" />
              )}

              {item.is_limited_edition && (
                <div className="absolute top-4 left-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                    {item.limited_edition_label || collection.limited_edition_label || "Limited Edition"}
                  </span>
                </div>
              )}

              {/* Image dots (mobile) */}
              {images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 lg:hidden">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === selectedImage
                          ? "w-5 bg-white"
                          : "w-1.5 bg-white/30"
                      }`}
                      aria-label={`Image ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border transition-all lg:h-[72px] lg:w-[72px] lg:rounded-xl ${
                      i === selectedImage
                        ? "border-white/40"
                        : "border-transparent opacity-40 hover:opacity-70"
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="mt-6 lg:mt-0">
            {/* Type */}
            {product.type && (
              <p className="text-[10px] uppercase tracking-[3px] text-[var(--text-secondary,#888)]/35">
                {product.type}
              </p>
            )}

            {/* Name */}
            <h1 className="mt-1 font-[var(--font-mono,'Space_Mono',monospace)] text-xl font-bold leading-tight text-[var(--text-primary,#fff)] sm:text-2xl">
              {product.name}
            </h1>

            {/* Price */}
            {price > 0 && (
              <p className="mt-2 font-[var(--font-mono,'Space_Mono',monospace)] text-lg text-[var(--text-primary,#fff)]">
                {currSymbol}{Number(price).toFixed(2)}
              </p>
            )}

            {/* Description */}
            {product.description && (
              <>
                <div className="my-5 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
                <p className="text-[14px] leading-[1.7] text-[var(--text-secondary,#888)]/65 whitespace-pre-line">
                  {product.description}
                </p>
              </>
            )}

            {/* Sizes */}
            {hasSizes && (
              <div className="mt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]/40">
                  Size
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size === selectedSize ? null : size)}
                      className={`min-w-[44px] rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-all touch-manipulation ${
                        size === selectedSize
                          ? "border-white/25 bg-white/[0.07] text-[var(--text-primary,#fff)]"
                          : "border-[var(--card-border,#2a2a2a)] text-[var(--text-secondary,#888)]/50 hover:border-white/10 hover:text-[var(--text-primary,#fff)]/70"
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
                  className={`w-full rounded-xl py-3.5 text-[13px] font-bold uppercase tracking-[2px] transition-all duration-200 touch-manipulation active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 ${
                    addedFeedback
                      ? "border border-emerald-400/20 bg-emerald-400/8 text-emerald-400"
                      : canAdd
                        ? "border border-white/10 bg-white/[0.07] text-white hover:bg-white/[0.10]"
                        : "border border-[var(--card-border,#2a2a2a)] text-[var(--text-secondary,#888)]/50"
                  }`}
                  style={canAdd && !addedFeedback ? {
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
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

            {/* Info line */}
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary,#888)]/35">
              <span>Pre-order</span>
              <span>&middot;</span>
              <span>Collect at event</span>
              {item.max_per_order && (
                <>
                  <span>&middot;</span>
                  <span>Limit {item.max_per_order} per order</span>
                </>
              )}
            </div>

            {/* Event link */}
            {event && (
              <Link
                href={`/event/${event.slug}/`}
                className="mt-4 flex items-center justify-between rounded-xl border border-[var(--card-border,#2a2a2a)] px-4 py-3 transition-all hover:border-white/10"
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[var(--text-primary,#fff)]/75 truncate">
                    {event.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-secondary,#888)]/40">
                    {event.date_start && (
                      <span>
                        {new Date(event.date_start).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                    {event.venue_name && (
                      <>
                        <span>&middot;</span>
                        <span className="truncate">{event.venue_name}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="ml-3 flex-shrink-0 text-[11px] text-[var(--text-secondary,#888)]/30">
                  &rarr;
                </span>
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Cart bar */}
      {cart.hasItems && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)]/95 backdrop-blur-lg safe-area-bottom">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[12px] font-bold text-white/60">
                {cart.totalQty}
              </span>
              <div>
                <p className="text-[13px] font-medium text-[var(--text-primary,#fff)]">
                  {cart.currSymbol}{cart.totalPrice.toFixed(2)}
                </p>
                <p className="text-[11px] text-[var(--text-secondary,#888)]/40">
                  {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="rounded-xl bg-white px-6 py-2.5 text-[12px] font-bold uppercase tracking-[2px] text-[#0e0e0e] transition-all touch-manipulation active:scale-[0.97] hover:bg-white/90"
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
