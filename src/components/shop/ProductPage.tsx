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
import { ProductCard } from "./ProductCard";
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

  // Touch swipe
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

  // Other items in this collection (for "More from this collection")
  const otherItems = ((collection.items || []) as MerchCollectionItem[])
    .filter((i) => i.id !== item.id && i.product)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-[var(--bg-dark,#0e0e0e)]">
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
        <VerifiedBanner />
        <Header />
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-24 pb-32 sm:px-6 sm:pt-28 lg:px-8">
        {/* Back link */}
        <nav className="mb-6">
          <Link
            href={`/shop/${collection.slug}/`}
            className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em] text-foreground/35 transition-colors hover:text-foreground/60"
          >
            &larr; {collection.title}
          </Link>
        </nav>

        <div className="lg:grid lg:grid-cols-2 lg:gap-12 xl:gap-16">
          {/* Image gallery */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-2xl"
              style={{
                backgroundColor: "rgba(255,255,255, 0.025)",
                border: "1px solid rgba(255,255,255, 0.06)",
              }}
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
                <div className="h-full w-full bg-gradient-to-br from-foreground/[0.03] to-transparent" />
              )}

              {item.is_limited_edition && (
                <div className="absolute top-4 left-4">
                  <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-black/60 px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300 backdrop-blur-sm">
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
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl transition-all duration-200 lg:h-[72px] lg:w-[72px] ${
                      i === selectedImage
                        ? "ring-2 ring-white/30 ring-offset-2 ring-offset-[var(--bg-dark,#0e0e0e)]"
                        : "opacity-40 hover:opacity-70"
                    }`}
                    style={{
                      border: "1px solid rgba(255,255,255, 0.06)",
                    }}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="mt-8 lg:mt-0">
            {/* Type */}
            {product.type && (
              <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">
                {product.type}
              </p>
            )}

            {/* Name */}
            <h1 className="mt-2 font-[family-name:var(--font-sans)] text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
              {product.name}
            </h1>

            {/* Price */}
            {price > 0 && (
              <p className="mt-3 font-[family-name:var(--font-mono)] text-xl font-bold tracking-[0.5px] text-foreground">
                {currSymbol}{Number(price).toFixed(2)}
              </p>
            )}

            {/* Divider */}
            <div className="my-6 h-px bg-gradient-to-r from-foreground/[0.08] via-foreground/[0.08] to-transparent" />

            {/* Description */}
            {product.description && (
              <div className="mb-6">
                <p className="font-[family-name:var(--font-display)] text-[15px] leading-[1.75] tracking-[0.01em] text-foreground/60 whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Size selector */}
            {hasSizes && (
              <div className="mb-6">
                <div className="flex items-baseline justify-between mb-3">
                  <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">
                    Size
                  </p>
                  {selectedSize && (
                    <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/50">
                      {selectedSize}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => {
                    const isSelected = size === selectedSize;
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(isSelected ? null : size)}
                        className="min-w-[48px] rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200 touch-manipulation active:scale-[0.95]"
                        style={{
                          backgroundColor: isSelected
                            ? "rgba(255,255,255, 0.08)"
                            : "rgba(255,255,255, 0.025)",
                          border: isSelected
                            ? "1px solid rgba(255,255,255, 0.20)"
                            : "1px solid rgba(255,255,255, 0.06)",
                          color: isSelected
                            ? "var(--text-primary, #fff)"
                            : "rgba(255,255,255, 0.50)",
                          boxShadow: isSelected
                            ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px rgba(255,255,255,0.03)"
                            : "none",
                        }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add to cart — proper glass CTA */}
            {price > 0 && (
              <button
                onClick={handleAddToCart}
                disabled={!canAdd}
                className="w-full h-[52px] rounded-xl text-[13px] font-bold uppercase tracking-[0.03em] transition-all duration-300 touch-manipulation active:scale-[0.98] disabled:cursor-not-allowed"
                style={
                  addedFeedback
                    ? {
                        backgroundColor: "rgba(52, 211, 153, 0.08)",
                        border: "1px solid rgba(52, 211, 153, 0.20)",
                        color: "#34D399",
                      }
                    : canAdd
                      ? {
                          backgroundColor: "rgba(255,255,255, 0.12)",
                          border: "1px solid rgba(255,255,255, 0.18)",
                          color: "#fff",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 20px rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.25)",
                        }
                      : {
                          backgroundColor: "rgba(255,255,255, 0.04)",
                          border: "1px solid rgba(255,255,255, 0.06)",
                          color: "rgba(255,255,255, 0.25)",
                        }
                }
              >
                {addedFeedback
                  ? "Added to cart"
                  : !canAdd
                    ? "Select a size"
                    : "Add to Cart"}
              </button>
            )}

            {/* Meta info line */}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-foreground/25">
              <span>Pre-order</span>
              <span className="text-foreground/10">/</span>
              <span>Collect at event</span>
              {item.max_per_order && (
                <>
                  <span className="text-foreground/10">/</span>
                  <span>Max {item.max_per_order} per order</span>
                </>
              )}
            </div>

            {/* Divider */}
            <div className="my-6 h-px bg-gradient-to-r from-foreground/[0.06] to-transparent" />

            {/* Event card */}
            {event && (
              <Link
                href={`/event/${event.slug}/`}
                className="group/event block rounded-xl overflow-hidden transition-all duration-200"
                style={{
                  backgroundColor: "rgba(255,255,255, 0.025)",
                  border: "1px solid rgba(255,255,255, 0.06)",
                }}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Event image thumbnail */}
                  {(event.cover_image || event.hero_image) && (
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255, 0.06)" }}>
                      <img
                        src={event.cover_image || event.hero_image || ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-[family-name:var(--font-sans)] text-[14px] font-semibold tracking-[0.04em] text-foreground truncate">
                      {event.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/35">
                      {event.date_start && (
                        <span>
                          {new Date(event.date_start).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      {event.venue_name && (
                        <>
                          <span className="text-foreground/15">/</span>
                          <span className="truncate">{event.venue_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="flex-shrink-0 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-foreground/25 transition-colors group-hover/event:text-foreground/50">
                    Tickets &rarr;
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>

        {/* More from this collection */}
        {otherItems.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-10" />
            <div className="flex items-center gap-3 mb-6">
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 shrink-0">
                More from {collection.title}
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-foreground/[0.06] to-transparent" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {otherItems.map((otherItem) => (
                <ProductCard
                  key={otherItem.id}
                  item={otherItem}
                  variant="standard"
                  collectionSlug={collection.slug}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Cart bar — matches MidnightCartSummary bottom bar pattern */}
      {cart.hasItems && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[997] will-change-transform"
          style={{
            background: "linear-gradient(to top, var(--bg-dark, #0e0e0e) 0%, rgba(14,14,14,0.97) 100%)",
            borderTop: "1px solid rgba(255,255,255, 0.06)",
          }}
        >
          <div
            className="mx-auto flex max-w-6xl items-center justify-between px-5"
            style={{ paddingTop: "14px", paddingBottom: "max(14px, calc(12px + env(safe-area-inset-bottom)))" }}
          >
            <div>
              <p className="font-[family-name:var(--font-mono)] text-[17px] font-bold tracking-[0.01em] text-foreground">
                {cart.currSymbol}{cart.totalPrice.toFixed(2)}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/35">
                {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
              </p>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="h-11 rounded-xl bg-white px-7 text-[13px] font-bold tracking-[0.03em] uppercase text-[#0e0e0e] transition-all touch-manipulation active:scale-[0.97] hover:bg-white/90"
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
