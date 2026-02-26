"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useShopCart } from "@/hooks/useShopCart";
import { normalizeMerchImages } from "@/lib/merch-images";
import { getCurrencySymbol } from "@/lib/stripe/config";
import { ProductCard } from "./ProductCard";
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
  const router = useRouter();
  const product = item.product;
  const event = collection.event as Event | undefined;
  const currency = event?.currency || "GBP";
  const currSymbol = getCurrencySymbol(currency);
  const cart = useShopCart(currency);

  const images = product ? normalizeMerchImages(product.images) : [];
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [qty, setQty] = useState(1);

  const price = item.custom_price ?? product?.price ?? 0;
  const hasSizes = product?.sizes && product.sizes.length > 0;
  const canAdd = !hasSizes || selectedSize !== null;
  const maxQty = item.max_per_order || 10;

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
    for (let i = 0; i < qty; i++) {
      cart.addItem(item, selectedSize || undefined);
    }
    setAddedFeedback(true);
    setQty(1);
    setTimeout(() => setAddedFeedback(false), 1800);
  }, [canAdd, cart, item, selectedSize, qty]);

  if (!product) return null;

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

      <main className={`mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28 lg:px-8 ${cart.hasItems ? "pb-28" : "pb-16"}`}>
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
                <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 mb-3">
                  Size
                </p>
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

            {/* Quantity selector */}
            {price > 0 && (
              <div className="mb-4">
                <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 mb-3">
                  Quantity
                </p>
                <div
                  className="inline-flex items-center rounded-xl"
                  style={{
                    backgroundColor: "rgba(255,255,255, 0.025)",
                    border: "1px solid rgba(255,255,255, 0.06)",
                  }}
                >
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="flex h-11 w-11 items-center justify-center text-[16px] text-foreground/50 transition-colors touch-manipulation active:scale-[0.95] disabled:text-foreground/15"
                  >
                    &minus;
                  </button>
                  <span
                    className="flex h-11 w-10 items-center justify-center font-[family-name:var(--font-mono)] text-[14px] font-bold text-foreground"
                    style={{ borderLeft: "1px solid rgba(255,255,255, 0.06)", borderRight: "1px solid rgba(255,255,255, 0.06)" }}
                  >
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    className="flex h-11 w-11 items-center justify-center text-[16px] text-foreground/50 transition-colors touch-manipulation active:scale-[0.95] disabled:text-foreground/15"
                  >
                    +
                  </button>
                </div>
                {item.max_per_order && (
                  <p className="mt-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] text-foreground/25">
                    Max {item.max_per_order} per order
                  </p>
                )}
              </div>
            )}

            {/* Add to cart — glass CTA */}
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
                    : qty > 1
                      ? `Add ${qty} to Cart`
                      : "Add to Cart"}
              </button>
            )}

            {/* Cart summary — inline preview when items in cart */}
            {cart.hasItems && (
              <div
                className="mt-4 rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "rgba(255,255,255, 0.025)",
                  border: "1px solid rgba(255,255,255, 0.06)",
                }}
              >
                <div className="px-4 py-3">
                  <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">
                    Your Cart
                  </p>
                </div>
                <div style={{ borderTop: "1px solid rgba(255,255,255, 0.04)" }}>
                  {cart.items.map((cartItem) => (
                    <div
                      key={`${cartItem.collection_item_id}-${cartItem.merch_size || ""}`}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/70 truncate">
                          {cartItem.product_name}
                        </span>
                        {cartItem.merch_size && (
                          <span className="rounded-md px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-foreground/40" style={{ backgroundColor: "rgba(255,255,255, 0.04)", border: "1px solid rgba(255,255,255, 0.06)" }}>
                            {cartItem.merch_size}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <div className="flex items-center gap-0">
                          <button
                            onClick={() => cart.removeItem(cartItem.collection_item_id, cartItem.merch_size)}
                            className="flex h-7 w-7 items-center justify-center text-[13px] text-foreground/35 transition-colors hover:text-foreground/60 touch-manipulation"
                          >
                            &minus;
                          </button>
                          <span className="w-5 text-center font-[family-name:var(--font-mono)] text-[12px] font-medium text-foreground/60">
                            {cartItem.qty}
                          </span>
                          <button
                            onClick={() => cart.addItem(item, cartItem.merch_size)}
                            className="flex h-7 w-7 items-center justify-center text-[13px] text-foreground/35 transition-colors hover:text-foreground/60 touch-manipulation"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-[family-name:var(--font-mono)] text-[12px] font-medium text-foreground/50 w-14 text-right">
                          {cart.currSymbol}{(cartItem.unit_price * cartItem.qty).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works — 3-step flow */}
            <div className="mt-5">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "rgba(255,255,255, 0.025)",
                  border: "1px solid rgba(255,255,255, 0.06)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                }}
              >
                <div className="px-4 pt-4 pb-1">
                  <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">
                    How it works
                  </p>
                </div>

                <div className="grid grid-cols-3">
                  {/* Step 1 */}
                  <div className="px-4 py-4 text-center">
                    <div className="mx-auto mb-2.5 flex h-8 w-8 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[12px] font-bold text-foreground/60" style={{ backgroundColor: "rgba(255,255,255, 0.05)", border: "1px solid rgba(255,255,255, 0.08)" }}>
                      1
                    </div>
                    <p className="font-[family-name:var(--font-sans)] text-[12px] font-semibold text-foreground/75">
                      Pre-order
                    </p>
                    <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.04em] text-foreground/30">
                      Secure yours now
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="px-4 py-4 text-center" style={{ borderLeft: "1px solid rgba(255,255,255, 0.04)", borderRight: "1px solid rgba(255,255,255, 0.04)" }}>
                    <div className="mx-auto mb-2.5 flex h-8 w-8 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[12px] font-bold text-foreground/60" style={{ backgroundColor: "rgba(255,255,255, 0.05)", border: "1px solid rgba(255,255,255, 0.08)" }}>
                      2
                    </div>
                    <p className="font-[family-name:var(--font-sans)] text-[12px] font-semibold text-foreground/75">
                      Get QR code
                    </p>
                    <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.04em] text-foreground/30">
                      Sent to your email
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="px-4 py-4 text-center">
                    <div className="mx-auto mb-2.5 flex h-8 w-8 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[12px] font-bold text-foreground/60" style={{ backgroundColor: "rgba(255,255,255, 0.05)", border: "1px solid rgba(255,255,255, 0.08)" }}>
                      3
                    </div>
                    <p className="font-[family-name:var(--font-sans)] text-[12px] font-semibold text-foreground/75">
                      Collect at event
                    </p>
                    <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.04em] text-foreground/30">
                      Scan &amp; pick up
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Event attendance — you MUST be going */}
            {event && (
              <Link
                href={`/event/${event.slug}/`}
                className="group/event mt-3 block rounded-xl overflow-hidden transition-all duration-200 hover:border-foreground/[0.12]"
                style={{
                  backgroundColor: "rgba(255,255,255, 0.025)",
                  border: "1px solid rgba(255,255,255, 0.06)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
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
                    <p className="font-[family-name:var(--font-sans)] text-[13px] font-semibold text-foreground/75">
                      You&apos;ll need a ticket to {event.name}
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
                    Get tickets &rarr;
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

      <MidnightFooter />

      {/* Sticky bottom checkout bar — prominent CTA when cart has items */}
      {cart.hasItems && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{
            background: "linear-gradient(to top, rgba(14,14,14, 0.98) 60%, rgba(14,14,14, 0.90) 80%, transparent 100%)",
            paddingTop: "24px",
          }}
        >
          <div className="mx-auto max-w-6xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
            <button
              onClick={() => router.push(`/shop/${collection.slug}/checkout`)}
              className="w-full flex items-center justify-between h-[56px] rounded-2xl px-6 transition-all duration-200 touch-manipulation active:scale-[0.98] hover:-translate-y-px"
              style={{
                background: "linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%)",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.5)",
              }}
            >
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-bold tracking-[0.02em] text-[#0e0e0e]">Checkout</span>
                <span className="font-[family-name:var(--font-mono)] text-[12px] font-semibold text-[#0e0e0e]/40">
                  {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
                </span>
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[15px] font-bold tracking-[-0.01em] text-[#0e0e0e]">
                {cart.currSymbol}{cart.totalPrice.toFixed(2)}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
