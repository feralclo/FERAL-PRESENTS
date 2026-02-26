"use client";

import Link from "next/link";
import { normalizeMerchImages } from "@/lib/merch-images";
import type { MerchCollectionItem } from "@/types/merch-store";

interface ProductCardProps {
  item: MerchCollectionItem;
  variant: "featured" | "standard";
  collectionSlug: string;
}

export function ProductCard({ item, variant, collectionSlug }: ProductCardProps) {
  const product = item.product;
  if (!product) return null;

  const images = normalizeMerchImages(product.images);
  const primaryImage = images[0];
  const price = item.custom_price ?? product.price;
  const isFeatured = variant === "featured";

  return (
    <Link
      href={`/shop/${collectionSlug}/${item.id}/`}
      className={`group relative overflow-hidden rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] text-left transition-all duration-300 hover:border-white/[0.08] ${
        isFeatured ? "sm:flex" : ""
      }`}
    >
      {/* Image */}
      <div
        className={`relative overflow-hidden ${
          isFeatured
            ? "aspect-[4/5] sm:aspect-auto sm:w-1/2"
            : "aspect-[4/5]"
        }`}
      >
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[var(--card-bg,#1a1a1a)] to-[var(--bg-dark,#0e0e0e)]" />
        )}

        {item.is_limited_edition && (
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
              {item.limited_edition_label || "Limited Edition"}
            </span>
          </div>
        )}

        {/* Second image on hover */}
        {images[1] && (
          <img
            src={images[1]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
      </div>

      {/* Info */}
      <div className={`px-4 py-3.5 ${isFeatured ? "sm:flex sm:flex-1 sm:flex-col sm:justify-center sm:px-5 sm:py-5" : ""}`}>
        {product.type && (
          <p className="text-[10px] uppercase tracking-[2px] text-[var(--text-secondary,#888)]/30">
            {product.type}
          </p>
        )}
        <h3
          className={`mt-0.5 font-[var(--font-mono,'Space_Mono',monospace)] font-bold text-[var(--text-primary,#fff)] ${
            isFeatured ? "text-base sm:text-lg" : "text-[13px]"
          }`}
        >
          {product.name}
        </h3>

        <div className="mt-2 flex items-center justify-between">
          {price > 0 ? (
            <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-[14px] text-[var(--text-primary,#fff)]/80">
              {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(price))}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--text-secondary,#888)]/40">
              Price TBC
            </span>
          )}
          <span className="text-[11px] text-[var(--text-secondary,#888)]/30 opacity-0 transition-opacity group-hover:opacity-100">
            &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
