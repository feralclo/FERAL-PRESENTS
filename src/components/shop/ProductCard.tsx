"use client";

import { normalizeMerchImages } from "@/lib/merch-images";
import type { MerchCollectionItem } from "@/types/merch-store";

interface ProductCardProps {
  item: MerchCollectionItem;
  variant: "featured" | "standard";
  onClick: () => void;
}

export function ProductCard({ item, variant, onClick }: ProductCardProps) {
  const product = item.product;
  if (!product) return null;

  const images = normalizeMerchImages(product.images);
  const primaryImage = images[0];
  const price = item.custom_price ?? product.price;
  const isFeatured = variant === "featured";

  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] text-left transition-all duration-300 hover:border-[var(--accent,#ff0033)]/30 hover:shadow-lg hover:shadow-[var(--accent,#ff0033)]/5 ${
        isFeatured ? "sm:flex" : ""
      }`}
    >
      {/* Image */}
      <div
        className={`relative overflow-hidden ${
          isFeatured
            ? "aspect-square sm:aspect-auto sm:w-1/2"
            : "aspect-square"
        }`}
      >
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--card-bg,#1a1a1a)] to-[var(--bg-dark,#0e0e0e)]">
            <span className="text-3xl text-[var(--text-secondary,#888)]/15">&#9670;</span>
          </div>
        )}

        {/* Limited edition badge */}
        {item.is_limited_edition && (
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
              <span className="text-amber-400">&#9830;</span>
              {item.limited_edition_label || "Limited Edition"}
            </span>
          </div>
        )}

        {/* Second image on hover (if available) */}
        {images[1] && (
          <img
            src={images[1]}
            alt={`${product.name} alternate`}
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
      </div>

      {/* Info */}
      <div className={`px-4 py-4 ${isFeatured ? "sm:flex sm:flex-1 sm:flex-col sm:justify-center sm:px-6 sm:py-6" : ""}`}>
        <p className="text-[11px] uppercase tracking-[2px] text-[var(--text-secondary,#888)]/60">
          {product.type}
        </p>
        <h3
          className={`mt-1 font-[var(--font-mono,'Space_Mono',monospace)] font-bold text-[var(--text-primary,#fff)] group-hover:text-[var(--accent,#ff0033)] transition-colors ${
            isFeatured ? "text-lg sm:text-xl" : "text-sm"
          }`}
        >
          {product.name}
        </h3>

        {/* Sizes */}
        {product.sizes && product.sizes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {product.sizes.map((size) => (
              <span
                key={size}
                className="rounded border border-[var(--card-border,#2a2a2a)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary,#888)]"
              >
                {size}
              </span>
            ))}
          </div>
        )}

        {/* Price */}
        <div className="mt-3 flex items-center justify-between">
          {price > 0 ? (
            <span className="font-[var(--font-mono,'Space_Mono',monospace)] text-base font-bold text-[var(--text-primary,#fff)]">
              £{Number(price).toFixed(2)}
            </span>
          ) : (
            <span className="text-sm text-[var(--text-secondary,#888)]">
              Price TBC
            </span>
          )}
          <span className="text-[11px] font-semibold text-[var(--accent,#ff0033)] opacity-0 transition-opacity group-hover:opacity-100">
            View Details
          </span>
        </div>
      </div>
    </button>
  );
}
