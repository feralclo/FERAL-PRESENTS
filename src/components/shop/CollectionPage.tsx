"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useShopCart } from "@/hooks/useShopCart";
import { ProductCard } from "./ProductCard";
import { MerchCheckout } from "./MerchCheckout";
import type { MerchCollection, MerchCollectionItem } from "@/types/merch-store";
import type { Event } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface CollectionPageProps {
  collection: MerchCollection;
}

export function CollectionPage({ collection }: CollectionPageProps) {
  const headerHidden = useHeaderScroll();
  const [showCheckout, setShowCheckout] = useState(false);

  const event = collection.event as Event | undefined;
  const heroImage = collection.hero_image || event?.hero_image || event?.cover_image;
  const items = (collection.items || []) as MerchCollectionItem[];
  const featuredItems = items.filter((i) => i.is_featured);
  const regularItems = items.filter((i) => !i.is_featured);

  const currency = event?.currency || "GBP";
  const cart = useShopCart(currency);

  // Checkout view
  if (showCheckout && event) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark,#0e0e0e)]">
        <header
          className={`header${headerHidden ? " header--hidden" : ""}`}
          id="header"
        >
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
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {heroImage ? (
            <>
              <img
                src={heroImage}
                alt={collection.title}
                className="h-full w-full object-cover"
                style={{ filter: "saturate(1.15)", transform: "scale(1.05)" }}
              />
              {/* Cinematic dissolve — matches MidnightHero */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg,
                    rgba(0,0,0,0.25) 0%,
                    rgba(0,0,0,0.05) 10%,
                    transparent 22%,
                    transparent 38%,
                    rgba(0,0,0,0.2) 50%,
                    rgba(0,0,0,0.5) 62%,
                    rgba(0,0,0,0.78) 75%,
                    var(--bg-dark, #0e0e0e) 92%
                  )`,
                }}
              />
            </>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-foreground/[0.03] to-transparent" />
          )}
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-36 pb-16 text-center sm:pt-44 sm:pb-24">
          {collection.is_limited_edition && (
            <div className="mb-4 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 backdrop-blur-sm">
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                {collection.limited_edition_label || "Limited Edition"}
              </span>
            </div>
          )}

          <h1
            className="font-[family-name:var(--font-sans)] font-black text-foreground"
            style={{
              fontSize: "clamp(2rem, 7vw, 4rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {collection.title}
          </h1>

          {collection.description && (
            <p className="mt-5 text-[15px] leading-relaxed text-foreground/60 max-w-lg mx-auto">
              {collection.description}
            </p>
          )}

          {/* Event info — date & location prominent */}
          {event && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                {event.date_start && (
                  <span className="font-[family-name:var(--font-sans)] text-[14px] font-semibold tracking-[-0.01em] text-foreground/70">
                    {new Date(event.date_start).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                )}
                {event.venue_name && (
                  <>
                    <span className="text-foreground/20 hidden sm:inline">&middot;</span>
                    <span className="font-[family-name:var(--font-sans)] text-[14px] font-semibold tracking-[-0.01em] text-foreground/70">
                      {event.venue_name}
                    </span>
                  </>
                )}
              </div>
              <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/30">
                {event.name}
              </p>
            </div>
          )}

        </div>
      </section>

      {/* How it works — 3-step flow */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: "rgba(255,255,255, 0.025)",
            border: "1px solid rgba(255,255,255, 0.06)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="flex items-center gap-4 px-5 py-4 sm:flex-col sm:text-center sm:px-4 sm:py-5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[13px] font-bold text-foreground/60 sm:mx-auto sm:mb-1" style={{ backgroundColor: "rgba(255,255,255, 0.05)", border: "1px solid rgba(255,255,255, 0.08)" }}>
                1
              </div>
              <div className="sm:text-center">
                <p className="font-[family-name:var(--font-sans)] text-[13px] font-semibold text-foreground/75">
                  Pre-order online
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.04em] text-foreground/30">
                  Secure your merch before the event
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-4 px-5 py-4 sm:flex-col sm:text-center sm:px-4 sm:py-5 border-y sm:border-y-0 sm:border-x" style={{ borderColor: "rgba(255,255,255, 0.04)" }}>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[13px] font-bold text-foreground/60 sm:mx-auto sm:mb-1" style={{ backgroundColor: "rgba(255,255,255, 0.05)", border: "1px solid rgba(255,255,255, 0.08)" }}>
                2
              </div>
              <div className="sm:text-center">
                <p className="font-[family-name:var(--font-sans)] text-[13px] font-semibold text-foreground/75">
                  Receive your QR code
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.04em] text-foreground/30">
                  Confirmation and QR sent to your email
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-4 px-5 py-4 sm:flex-col sm:text-center sm:px-4 sm:py-5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[13px] font-bold text-foreground/60 sm:mx-auto sm:mb-1" style={{ backgroundColor: "rgba(255,255,255, 0.05)", border: "1px solid rgba(255,255,255, 0.08)" }}>
                3
              </div>
              <div className="sm:text-center">
                <p className="font-[family-name:var(--font-sans)] text-[13px] font-semibold text-foreground/75">
                  Collect at the event
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.04em] text-foreground/30">
                  Scan your QR at the merch stand
                </p>
              </div>
            </div>
          </div>

          {/* Event attendance callout */}
          {event && (
            <div style={{ borderTop: "1px solid rgba(255,255,255, 0.04)" }}>
              <Link
                href={`/event/${event.slug}/`}
                className="group/event flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-foreground/[0.015]"
              >
                <p className="font-[family-name:var(--font-sans)] text-[12px] text-foreground/50">
                  You&apos;ll need a ticket to <span className="font-semibold text-foreground/70">{event.name}</span> to collect your order
                </p>
                <span className="flex-shrink-0 ml-4 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-foreground/25 transition-colors group-hover/event:text-foreground/50">
                  Get tickets &rarr;
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Products */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Featured */}
        {featuredItems.length > 0 && (
          <div className="mb-12">
            {items.length > featuredItems.length && (
              <div className="flex items-center gap-3 mb-5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 shrink-0">
                  Featured
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-foreground/[0.06] to-transparent" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {featuredItems.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  variant="featured"
                  collectionSlug={collection.slug}
                />
              ))}
            </div>
          </div>
        )}

        {/* All items */}
        {regularItems.length > 0 && (
          <div>
            {featuredItems.length > 0 && (
              <div className="flex items-center gap-3 mb-5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 shrink-0">
                  All Items
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-foreground/[0.06] to-transparent" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {regularItems.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  variant="standard"
                  collectionSlug={collection.slug}
                />
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="py-24 text-center">
            <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-foreground/25">
              Coming soon
            </p>
          </div>
        )}
      </section>

      {/* Inline cart summary — replaces sticky bar */}
      {cart.hasItems && (
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: "rgba(255,255,255, 0.025)",
              border: "1px solid rgba(255,255,255, 0.06)",
            }}
          >
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">
                  Your Cart
                </p>
                <p className="mt-1">
                  <span className="font-[family-name:var(--font-mono)] text-[17px] font-bold tracking-[0.01em] text-foreground">
                    {cart.currSymbol}{cart.totalPrice.toFixed(2)}
                  </span>
                  <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/35">
                    {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowCheckout(true)}
                className="h-11 rounded-xl bg-white px-7 text-[13px] font-bold tracking-[0.03em] uppercase text-[#0e0e0e] transition-all touch-manipulation active:scale-[0.97] hover:bg-white/90"
              >
                Checkout
              </button>
            </div>

            {/* Cart items */}
            <div style={{ borderTop: "1px solid rgba(255,255,255, 0.04)" }}>
              {cart.items.map((cartItem) => (
                <div
                  key={`${cartItem.collection_item_id}-${cartItem.merch_size || ""}`}
                  className="flex items-center justify-between px-5 py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255, 0.02)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/60 truncate">
                      {cartItem.product_name}
                    </span>
                    {cartItem.merch_size && (
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/30">
                        {cartItem.merch_size}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="font-[family-name:var(--font-mono)] text-[12px] text-foreground/40">
                      &times;{cartItem.qty}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium text-foreground/60 w-16 text-right">
                      {cart.currSymbol}{(cartItem.unit_price * cartItem.qty).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <MidnightFooter />
    </div>
  );
}
