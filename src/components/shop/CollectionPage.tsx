"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useShopCart } from "@/hooks/useShopCart";
import { ProductCard } from "./ProductCard";
import type { MerchCollection, MerchCollectionItem } from "@/types/merch-store";
import type { Event } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface CollectionPageProps {
  collection: MerchCollection;
}

export function CollectionPage({ collection }: CollectionPageProps) {
  const headerHidden = useHeaderScroll();
  const router = useRouter();

  const event = collection.event as Event | undefined;
  const heroImage = collection.hero_image || event?.hero_image || event?.cover_image;
  const items = (collection.items || []) as MerchCollectionItem[];
  const featuredItems = items.filter((i) => i.is_featured);
  const regularItems = items.filter((i) => !i.is_featured);

  const currency = event?.currency || "GBP";
  const cart = useShopCart(currency);

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

      <MidnightFooter />

      {/* Sticky bottom checkout bar */}
      {cart.hasItems && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{
            background: "linear-gradient(to top, rgba(14,14,14, 0.98) 60%, rgba(14,14,14, 0.90) 80%, transparent 100%)",
            paddingTop: "24px",
          }}
        >
          <div className="mx-auto max-w-6xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6">
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
