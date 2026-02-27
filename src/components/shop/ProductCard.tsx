"use client";

import Link from "next/link";
import { normalizeMerchImages } from "@/lib/merch-images";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import type { MerchCollectionItem } from "@/types/merch-store";

interface ProductCardProps {
  item: MerchCollectionItem;
  variant: "featured" | "standard";
  collectionSlug: string;
}

export function ProductCard({ item, variant, collectionSlug }: ProductCardProps) {
  const product = item.product;
  const { convertPrice, formatPrice } = useCurrencyContext();
  if (!product) return null;

  const images = normalizeMerchImages(product.images);
  const primaryImage = images[0];
  const price = item.custom_price ?? product.price;
  const isFeatured = variant === "featured";

  return (
    <Link
      href={`/shop/${collectionSlug}/${item.id}/`}
      className={`group relative overflow-hidden rounded-xl transition-all duration-200 ${
        isFeatured ? "sm:flex" : ""
      }`}
      style={{
        backgroundColor: "rgba(255,255,255, 0.025)",
        border: "1px solid rgba(255,255,255, 0.06)",
      }}
    >
      {/* Hover overlay — the card gains depth on interaction */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          backgroundColor: "rgba(255,255,255, 0.015)",
          border: "1px solid rgba(255,255,255, 0.12)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 16px rgba(255,255,255,0.02)",
        }}
      />

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
          <div className="h-full w-full bg-gradient-to-br from-foreground/[0.03] to-transparent" />
        )}

        {item.is_limited_edition && (
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300 backdrop-blur-sm">
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
      <div className={`relative px-4 py-4 ${isFeatured ? "sm:flex sm:flex-1 sm:flex-col sm:justify-center sm:px-5 sm:py-5" : ""}`}>
        {product.type && (
          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-foreground/30">
            {product.type}
          </p>
        )}
        <h3
          className={`mt-1 font-[family-name:var(--font-sans)] font-semibold tracking-[0.04em] text-foreground ${
            isFeatured ? "text-base sm:text-lg" : "text-sm"
          }`}
        >
          {product.name}
        </h3>

        <div className="mt-2.5 flex items-center justify-between">
          {price > 0 ? (
            <span className="font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] text-foreground">
              {formatPrice(convertPrice(Number(price)))}
            </span>
          ) : (
            <span className="font-[family-name:var(--font-mono)] text-[12px] tracking-[0.08em] text-foreground/35">
              Price TBC
            </span>
          )}
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-foreground/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            View
          </span>
        </div>
      </div>
    </Link>
  );
}
