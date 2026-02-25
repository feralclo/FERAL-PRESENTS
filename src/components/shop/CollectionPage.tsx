"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useShopCart } from "@/hooks/useShopCart";
import { ProductCard } from "./ProductCard";
import { ProductDetailModal } from "./ProductDetailModal";
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
  const [selectedItem, setSelectedItem] = useState<MerchCollectionItem | null>(null);
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
      {/* Header */}
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      {/* Hero section */}
      <section className="relative overflow-hidden">
        {/* Background image */}
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
          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-dark,#0e0e0e)]/60 via-[var(--bg-dark,#0e0e0e)]/40 to-[var(--bg-dark,#0e0e0e)]" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-32 pb-16 text-center sm:px-6 sm:pt-40 sm:pb-20">
          {/* Limited edition badge */}
          {collection.is_limited_edition && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-amber-400 text-sm">&#9830;</span>
              <span className="text-[12px] font-semibold uppercase tracking-[2px] text-amber-300">
                {collection.limited_edition_label || "Limited Edition"}
              </span>
            </div>
          )}

          <h1 className="font-[var(--font-mono,'Space_Mono',monospace)] text-3xl font-bold tracking-tight text-[var(--text-primary,#fff)] sm:text-5xl">
            {collection.title}
          </h1>

          {collection.description && (
            <p className="mt-4 text-base text-[var(--text-secondary,#888)] max-w-2xl mx-auto sm:text-lg">
              {collection.description}
            </p>
          )}

          {/* Event info bar */}
          {event && (
            <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]/80 px-5 py-3 backdrop-blur-sm">
              <span className="text-[13px] font-medium text-[var(--text-primary,#fff)]">
                {event.name}
              </span>
              <span className="h-3 w-px bg-[var(--card-border,#2a2a2a)]" />
              <span className="text-[12px] text-[var(--text-secondary,#888)]">
                {new Date(event.date_start).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {event.venue_name && (
                <>
                  <span className="h-3 w-px bg-[var(--card-border,#2a2a2a)]" />
                  <span className="text-[12px] text-[var(--text-secondary,#888)]">
                    {event.venue_name}
                    {event.city ? `, ${event.city}` : ""}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pre-order info banner */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-xl border border-[var(--accent,#ff0033)]/15 bg-[var(--accent,#ff0033)]/5 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary,#fff)]">
                Pre-order &amp; Collect at the Event
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--text-secondary,#888)]">
                {collection.pickup_instructions ||
                  "Collect at the merch stand when you arrive at the event."}
                {" "}You&apos;ll receive a QR code to present for collection.
              </p>
            </div>
            {event && (
              <Link
                href={`/event/${event.slug}/`}
                className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-[var(--accent,#ff0033)]/30 bg-[var(--accent,#ff0033)]/10 px-4 py-2 text-[12px] font-semibold text-[var(--accent,#ff0033)] transition-all hover:bg-[var(--accent,#ff0033)]/20"
              >
                Need a ticket? Get one here &rarr;
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Featured items — larger cards */}
        {featuredItems.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-5 font-[var(--font-mono,'Space_Mono',monospace)] text-xs font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]">
              Featured
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {featuredItems.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  variant="featured"
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular items */}
        {regularItems.length > 0 && (
          <div>
            {featuredItems.length > 0 && (
              <h2 className="mb-5 font-[var(--font-mono,'Space_Mono',monospace)] text-xs font-semibold uppercase tracking-[3px] text-[var(--text-secondary,#888)]">
                All Items
              </h2>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {regularItems.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  variant="standard"
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </div>
        )}

        {/* No items state */}
        {items.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[var(--text-secondary,#888)] text-sm">
              This collection is being prepared. Check back soon.
            </p>
          </div>
        )}
      </section>

      {/* Product detail modal */}
      {selectedItem && (
        <ProductDetailModal
          item={selectedItem}
          collection={collection}
          event={event}
          onClose={() => setSelectedItem(null)}
          onAddToCart={(size) => {
            cart.addItem(selectedItem, size || undefined);
            setSelectedItem(null);
          }}
        />
      )}

      {/* Floating cart bar */}
      {cart.hasItems && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)]/95 backdrop-blur-lg safe-area-bottom">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent,#ff0033)] text-xs font-bold text-white">
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
              className="rounded-xl px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition-all"
              style={{ backgroundColor: "var(--accent, #ff0033)" }}
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
