"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MidnightFooter } from "@/components/midnight/MidnightFooter";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { normalizeMerchImages } from "@/lib/merch-images";
import type { MerchStoreSettings, MerchCollection } from "@/types/merch-store";
import type { Event } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface ShopLandingPageProps {
  collections: MerchCollection[];
  storeSettings: MerchStoreSettings;
}

export function ShopLandingPage({ collections, storeSettings }: ShopLandingPageProps) {
  const headerHidden = useHeaderScroll();

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

      {/* Page content */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 pt-36 pb-24 sm:px-6 sm:pt-40 lg:pt-44">
        {/* Heading */}
        <div className="mb-14 sm:mb-20">
          <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/25 mb-4">
            Pre-order
          </p>
          <h1
            className="font-[family-name:var(--font-sans)] font-black text-foreground"
            style={{
              fontSize: "clamp(2rem, 6vw, 3.5rem)",
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            {storeSettings.store_heading || "Shop"}
          </h1>
          {storeSettings.store_description && (
            <p className="mt-5 max-w-lg font-[family-name:var(--font-display)] text-[15px] leading-[1.8] text-foreground/45">
              {storeSettings.store_description}
            </p>
          )}
          <div className="mt-8 h-px bg-gradient-to-r from-foreground/[0.06] via-foreground/[0.04] to-transparent" />
        </div>

        {/* Collections grid */}
        {collections.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-foreground/25">
              Coming soon
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const event = collection.event as Event | undefined;
              const tileImage = collection.tile_image;
              const heroImage = collection.hero_image || event?.cover_image || event?.hero_image;

              // Get first product image as fallback
              const firstProductImage = collection.items?.[0]?.product
                ? normalizeMerchImages(collection.items[0].product.images)[0]
                : null;

              const displayImage = tileImage || heroImage || firstProductImage;
              const itemCount = collection.items?.length || 0;

              return (
                <Link
                  key={collection.id}
                  href={`/shop/${collection.slug}/`}
                  className="group relative overflow-hidden rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: "rgba(255,255,255, 0.025)",
                    border: "1px solid rgba(255,255,255, 0.06)",
                  }}
                >
                  {/* Hover overlay */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-10"
                    style={{
                      backgroundColor: "rgba(255,255,255, 0.015)",
                      border: "1px solid rgba(255,255,255, 0.12)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 16px rgba(255,255,255,0.02)",
                    }}
                  />

                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt={collection.title}
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-foreground/[0.03] to-transparent" />
                    )}

                    {/* Bottom gradient */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0.85) 100%)",
                      }}
                    />

                    {/* Limited edition badge */}
                    {collection.is_limited_edition && (
                      <div className="absolute top-3 left-3 z-10">
                        <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-black/60 px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300 backdrop-blur-sm">
                          {collection.limited_edition_label || "Limited Edition"}
                        </span>
                      </div>
                    )}

                    {/* Overlay content — positioned inside the image */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-4">
                      <h3 className="font-[family-name:var(--font-sans)] text-base font-bold tracking-[-0.01em] text-white">
                        {collection.title}
                      </h3>

                      {event && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.04em] text-white/50">
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
                              <span className="text-white/20">/</span>
                              <span>{event.venue_name}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255, 0.04)" }}>
                    <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-foreground/35">
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-foreground/25 transition-colors group-hover:text-foreground/50">
                      View &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <MidnightFooter />
    </div>
  );
}
