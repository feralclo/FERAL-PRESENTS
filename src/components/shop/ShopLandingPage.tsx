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
      <main className="relative z-10 mx-auto max-w-6xl px-4 pt-28 pb-20 sm:px-6">
        {/* Heading */}
        <div className="mb-12 text-center">
          <h1
            className="font-[var(--font-mono,'Space_Mono',monospace)] text-3xl font-bold tracking-tight text-[var(--text-primary,#fff)] sm:text-4xl"
          >
            {storeSettings.store_heading || "Shop"}
          </h1>
          {storeSettings.store_description && (
            <p className="mt-3 text-base text-[var(--text-secondary,#888)] max-w-lg mx-auto">
              {storeSettings.store_description}
            </p>
          )}
        </div>

        {/* Collections grid */}
        {collections.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[var(--text-secondary,#888)] text-sm">
              No collections available yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const event = collection.event as Event | undefined;
              const heroImage = collection.hero_image || event?.cover_image || event?.hero_image;

              // Get first product image as fallback
              const firstProductImage = collection.items?.[0]?.product
                ? normalizeMerchImages(collection.items[0].product.images)[0]
                : null;

              const displayImage = heroImage || firstProductImage;
              const itemCount = collection.items?.length || 0;

              return (
                <Link
                  key={collection.id}
                  href={`/shop/${collection.slug}/`}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] transition-all duration-300 hover:border-[var(--accent,#ff0033)]/30 hover:shadow-xl hover:shadow-[var(--accent,#ff0033)]/5"
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt={collection.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--card-bg,#1a1a1a)] to-[var(--bg-dark,#0e0e0e)]">
                        <span className="text-4xl text-[var(--text-secondary,#888)]/20">
                          &#9670;
                        </span>
                      </div>
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--card-bg,#1a1a1a)] via-transparent to-transparent opacity-80" />

                    {/* Limited edition badge */}
                    {collection.is_limited_edition && (
                      <div className="absolute top-3 right-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                          <span className="text-amber-400">&#9830;</span>
                          {collection.limited_edition_label || "Limited Edition"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="px-5 py-4">
                    <h3 className="font-[var(--font-mono,'Space_Mono',monospace)] text-base font-bold text-[var(--text-primary,#fff)] group-hover:text-[var(--accent,#ff0033)] transition-colors">
                      {collection.title}
                    </h3>

                    {event && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-secondary,#888)]">
                        <span>
                          {new Date(event.date_start).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {event.venue_name && (
                          <>
                            <span className="text-[var(--text-secondary,#888)]/40">|</span>
                            <span>{event.venue_name}</span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-[var(--text-secondary,#888)]/60">
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </span>
                      <span className="text-[12px] font-semibold text-[var(--accent,#ff0033)] opacity-0 transition-opacity group-hover:opacity-100">
                        View Collection &rarr;
                      </span>
                    </div>
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
