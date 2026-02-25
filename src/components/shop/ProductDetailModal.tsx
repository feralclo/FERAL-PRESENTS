"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { normalizeMerchImages } from "@/lib/merch-images";
import type { MerchCollection, MerchCollectionItem } from "@/types/merch-store";
import type { Event } from "@/types/events";

interface ProductDetailModalProps {
  item: MerchCollectionItem;
  collection: MerchCollection;
  event?: Event;
  onClose: () => void;
}

export function ProductDetailModal({
  item,
  collection,
  event,
  onClose,
}: ProductDetailModalProps) {
  const product = item.product;
  const images = product ? normalizeMerchImages(product.images) : [];
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const price = item.custom_price ?? product?.price ?? 0;

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Touch handling for image swipe
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return;
      const diff = touchStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && selectedImage < images.length - 1) {
          setSelectedImage((p) => p + 1);
        } else if (diff < 0 && selectedImage > 0) {
          setSelectedImage((p) => p - 1);
        }
      }
      setTouchStart(null);
    },
    [touchStart, selectedImage, images.length]
  );

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[var(--card-border,#2a2a2a)] bg-[var(--card-bg,#1a1a1a)] shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-[var(--text-primary,#fff)] backdrop-blur-sm transition-colors hover:bg-black/70"
          aria-label="Close"
        >
          &#10005;
        </button>

        {/* Image gallery */}
        <div
          className="relative aspect-square sm:aspect-[4/3] overflow-hidden rounded-t-2xl sm:rounded-t-2xl"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {images.length > 0 ? (
            <img
              src={images[selectedImage]}
              alt={product.name}
              className="h-full w-full object-cover transition-opacity duration-300"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--card-bg,#1a1a1a)] to-[var(--bg-dark,#0e0e0e)]">
              <span className="text-5xl text-[var(--text-secondary,#888)]/15">&#9670;</span>
            </div>
          )}

          {/* Image dots */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === selectedImage
                      ? "w-4 bg-[var(--text-primary,#fff)]"
                      : "w-1.5 bg-[var(--text-primary,#fff)]/40 hover:bg-[var(--text-primary,#fff)]/60"
                  }`}
                  aria-label={`Image ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Limited edition badge */}
          {item.is_limited_edition && (
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                <span className="text-amber-400">&#9830;</span>
                {item.limited_edition_label || collection.limited_edition_label || "Limited Edition"}
              </span>
            </div>
          )}

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="absolute bottom-3 right-3 hidden sm:flex items-center gap-1.5">
              {images.slice(0, 4).map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`h-10 w-10 overflow-hidden rounded-md border-2 transition-all ${
                    i === selectedImage
                      ? "border-[var(--text-primary,#fff)] shadow-lg"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img}
                    alt={`${product.name} ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product details */}
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-[11px] uppercase tracking-[2px] text-[var(--text-secondary,#888)]/60">
            {product.type}
          </p>
          <h2 className="mt-1 font-[var(--font-mono,'Space_Mono',monospace)] text-xl font-bold text-[var(--text-primary,#fff)] sm:text-2xl">
            {product.name}
          </h2>

          {/* Price */}
          {price > 0 && (
            <p className="mt-2 font-[var(--font-mono,'Space_Mono',monospace)] text-xl font-bold text-[var(--text-primary,#fff)]">
              £{Number(price).toFixed(2)}
            </p>
          )}

          {/* Description */}
          {product.description && (
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary,#888)]">
              {product.description}
            </p>
          )}

          {/* Size selector */}
          {product.sizes && product.sizes.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary,#888)]">
                Select Size
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size === selectedSize ? null : size)}
                    className={`min-w-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      size === selectedSize
                        ? "border-[var(--accent,#ff0033)] bg-[var(--accent,#ff0033)]/10 text-[var(--accent,#ff0033)]"
                        : "border-[var(--card-border,#2a2a2a)] text-[var(--text-secondary,#888)] hover:border-[var(--text-secondary,#888)]/50"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pre-order info */}
          <div className="mt-6 space-y-3">
            {/* Pickup info */}
            <div className="rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-base">&#128230;</span>
                <div>
                  <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                    Collect at the Event
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]">
                    {collection.pickup_instructions ||
                      "Present your QR code at the merch stand to collect your order."}
                  </p>
                </div>
              </div>
            </div>

            {/* QR code info */}
            <div className="rounded-lg border border-[var(--card-border,#2a2a2a)] bg-[var(--bg-dark,#0e0e0e)] px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-base">&#128274;</span>
                <div>
                  <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                    QR Code Confirmation
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]">
                    After purchase, you&apos;ll receive a QR code via email.
                    Show it at the event to collect your merch.
                  </p>
                </div>
              </div>
            </div>

            {/* Ticket requirement */}
            {event && (
              <div className="rounded-lg border border-[var(--accent,#ff0033)]/15 bg-[var(--accent,#ff0033)]/5 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-base">&#127915;</span>
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--text-primary,#fff)]">
                      Ticket Required for Collection
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-secondary,#888)]">
                      You&apos;ll need a ticket to{" "}
                      <span className="font-medium text-[var(--text-primary,#fff)]">
                        {event.name}
                      </span>{" "}
                      to collect your merch at the event.
                    </p>
                    <Link
                      href={`/event/${event.slug}/`}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent,#ff0033)] hover:underline"
                    >
                      Get your ticket &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coming soon — checkout button placeholder */}
          <div className="mt-6">
            <p className="text-center text-[11px] text-[var(--text-secondary,#888)]/60">
              Checkout for standalone merch pre-orders is coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
