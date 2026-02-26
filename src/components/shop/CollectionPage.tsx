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
            <img
              src={heroImage}
              alt={collection.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[var(--card-bg,#1a1a1a)] to-[var(--bg-dark,#0e0e0e)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-dark,#0e0e0e)]/60 via-[var(--bg-dark,#0e0e0e)]/40 to-[var(--bg-dark,#0e0e0e)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-32 pb-14 text-center sm:px-6 sm:pt-40 sm:pb-20">
          {collection.is_limited_edition && (
            <div className="mb-4 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 backdrop-blur-sm">
              <span className="text-[11px] font-semibold uppercase tracking-[2px] text-amber-300">
                {collection.limited_edition_label || "Limited Edition"}
              </span>
            </div>
          )}

          <h1 className="font-[var(--font-mono,'Space_Mono',monospace)] text-3xl font-bold tracking-tight text-[var(--text-primary,#fff)] sm:text-5xl">
            {collection.title}
          </h1>

          {collection.description && (
            <p className="mt-4 text-[15px] text-[var(--text-secondary,#888)]/65 max-w-xl mx-auto sm:text-base">
              {collection.description}
            </p>
          )}

          {/* Event info — quiet, inline */}
          {event && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 text-[12px] text-[var(--text-secondary,#888)]/50">
              <span>{event.name}</span>
              {event.date_start && (
                <>
                  <span>&middot;</span>
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
                  <span>&middot;</span>
                  <span>{event.venue_name}</span>
                </>
              )}
            </div>
          )}

          {/* Subtle pre-order note */}
          <p className="mt-3 text-[11px] text-[var(--text-secondary,#888)]/30">
            Pre-order &middot; Collect at the event
          </p>
        </div>
      </section>

      {/* Products */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Featured */}
        {featuredItems.length > 0 && (
          <div className="mb-10">
            {items.length > featuredItems.length && (
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]/30">
                Featured
              </p>
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
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]/30">
                All Items
              </p>
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
          <div className="py-20 text-center">
            <p className="text-[13px] text-[var(--text-secondary,#888)]/40">
              Coming soon
            </p>
          </div>
        )}
      </section>

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
