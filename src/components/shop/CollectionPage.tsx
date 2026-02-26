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

          {/* Event info — quiet inline text */}
          {event && (
            <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/35">
              <span>{event.name}</span>
              {event.date_start && (
                <>
                  <span className="text-foreground/15">/</span>
                  <span>
                    {new Date(event.date_start).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </>
              )}
              {event.venue_name && (
                <>
                  <span className="text-foreground/15">/</span>
                  <span>{event.venue_name}</span>
                </>
              )}
            </div>
          )}

          {/* Pre-order + ticket link */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-foreground/25">
              Pre-order &middot; Collect at event
            </span>
            {event?.slug && (
              <Link
                href={`/event/${event.slug}/`}
                className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-foreground/35 transition-colors hover:text-foreground/60"
              >
                Get tickets &rarr;
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
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

      {/* Cart bar */}
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
            <div className="flex items-center gap-3">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-[17px] font-bold tracking-[0.01em] text-foreground">
                  {cart.currSymbol}{cart.totalPrice.toFixed(2)}
                </p>
                <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/35">
                  {cart.totalQty} {cart.totalQty === 1 ? "item" : "items"}
                </p>
              </div>
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
