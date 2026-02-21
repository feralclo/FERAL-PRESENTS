"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MidnightSizeSelector } from "./MidnightSizeSelector";
import { normalizeMerchImages } from "@/lib/merch-images";
import type { TeeSize } from "@/types/tickets";
import { TEE_SIZES } from "@/types/tickets";
import type { DiscountDisplay } from "./discount-utils";
import { getDiscountedPrice } from "./discount-utils";
import { formatPrice } from "@/lib/stripe/config";

interface MidnightMerchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (size: TeeSize, qty: number) => void;
  merchName?: string;
  merchDescription?: string;
  merchImages?: string[] | { front?: string; back?: string };
  merchPrice?: number;
  currencySymbol?: string;
  availableSizes?: string[];
  ticketName?: string;
  ticketDescription?: string;
  vipBadge?: string;
  discount?: DiscountDisplay | null;
}

export function MidnightMerchModal({
  isOpen,
  onClose,
  onAddToCart,
  merchName,
  merchDescription,
  merchImages,
  merchPrice,
  currencySymbol = "\u00a3",
  availableSizes,
  ticketName,
  ticketDescription,
  vipBadge,
  discount,
}: MidnightMerchModalProps) {
  const images = useMemo(() => {
    return normalizeMerchImages(merchImages).map((src, i) => ({
      src,
      alt: `${merchName || "Merch"} ${i + 1}`,
    }));
  }, [merchImages, merchName]);

  const title = merchName || "Event Merch";
  const description = merchDescription || "";
  const price = merchPrice ?? 0;
  const sizes = (availableSizes || TEE_SIZES) as TeeSize[];

  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<TeeSize>(
    sizes.includes("M" as TeeSize) ? ("M" as TeeSize) : sizes[0]
  );
  const [qty, setQty] = useState(1);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  // Touch refs for swipe detection
  const mainTouchStartX = useRef(0);
  const fsTouchStartX = useRef(0);
  const fsDidSwipe = useRef(false);

  // Reset active index when images change
  useEffect(() => {
    setActiveIndex(0);
  }, [images.length]);

  // Fullscreen keyboard navigation
  useEffect(() => {
    if (!fullscreenOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        setFullscreenIndex((i) => (i - 1 + images.length) % images.length);
      } else if (e.key === "ArrowRight") {
        setFullscreenIndex((i) => (i + 1) % images.length);
      } else if (e.key === "Escape") {
        setFullscreenOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenOpen, images.length]);

  // Main view swipe handlers
  const onMainTouchStart = useCallback((e: React.TouchEvent) => {
    mainTouchStartX.current = e.touches[0].clientX;
  }, []);

  const onMainTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = e.changedTouches[0].clientX - mainTouchStartX.current;
      if (Math.abs(delta) > 50 && images.length > 1) {
        if (delta < 0 && activeIndex < images.length - 1) {
          setActiveIndex(activeIndex + 1);
        } else if (delta > 0 && activeIndex > 0) {
          setActiveIndex(activeIndex - 1);
        }
      }
    },
    [images.length, activeIndex]
  );

  // Fullscreen swipe handlers
  const onFsTouchStart = useCallback((e: React.TouchEvent) => {
    fsTouchStartX.current = e.touches[0].clientX;
    fsDidSwipe.current = false;
  }, []);

  const onFsTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = e.changedTouches[0].clientX - fsTouchStartX.current;
      if (Math.abs(delta) > 50) {
        fsDidSwipe.current = true;
        if (delta < 0) {
          setFullscreenIndex((i) => (i + 1) % images.length);
        } else {
          setFullscreenIndex((i) => (i - 1 + images.length) % images.length);
        }
      }
    },
    [images.length]
  );

  const handleAdd = useCallback(() => {
    onAddToCart(selectedSize, qty);
    onClose();
    setQty(1);
  }, [selectedSize, qty, onAddToCart, onClose]);

  const openFullscreen = useCallback(
    (idx: number) => {
      setFullscreenIndex(idx >= 0 ? idx : 0);
      setFullscreenOpen(true);
    },
    []
  );

  // Navigation helpers for main view
  const goNext = useCallback(() => {
    if (activeIndex < images.length - 1) {
      setActiveIndex(activeIndex + 1);
    }
  }, [activeIndex, images.length]);

  const goPrev = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
  }, [activeIndex]);

  // Chevron SVG shared between views
  const ChevronLeft = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15,18 9,12 15,6" />
    </svg>
  );
  const ChevronRight = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,6 15,12 9,18" />
    </svg>
  );

  return (
    <>
      {/* ── Product modal ─────────────────────── */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          data-theme="midnight"
          className="midnight-merch-dialog max-w-[420px] md:max-w-[680px] max-h-[85vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col bg-[#08080c] border-[rgba(255,255,255,0.06)]"
          style={{ maxHeight: "85dvh" }}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Merch details and size selection for {title}
          </DialogDescription>

          {/* ── Scrollable content ─────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="md:grid md:grid-cols-[1.1fr_1fr]">

              {/* Image area — with swipe + nav arrows */}
              <div
                className="relative bg-white/[0.02]"
                onTouchStart={onMainTouchStart}
                onTouchEnd={onMainTouchEnd}
              >
                <div className="flex justify-center items-center px-4 pt-6 pb-2 max-md:px-3 max-md:pt-5 max-md:pb-1 min-h-[300px] max-md:min-h-0 max-[380px]:min-h-0">
                  {images.length > 0 ? (
                    images.map((img, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={`${img.src}-${i}`}
                        src={img.src}
                        alt={img.alt}
                        className={`max-w-[340px] max-md:max-w-[240px] max-[380px]:max-w-[180px] max-h-[360px] max-md:max-h-[240px] max-[380px]:max-h-[180px] w-auto h-auto object-contain cursor-zoom-in transition-opacity duration-300 ${
                          activeIndex === i ? "block opacity-100" : "hidden opacity-0"
                        }`}
                        onClick={() => openFullscreen(i)}
                      />
                    ))
                  ) : (
                    <div className="w-[140px] h-[140px] rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] flex items-center justify-center">
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-[rgba(255,255,255,0.2)] uppercase tracking-[0.1em]">No image</span>
                    </div>
                  )}
                </div>

                {/* Navigation arrows — only when multiple images */}
                {images.length > 1 && (
                  <>
                    {activeIndex > 0 && (
                      <button
                        type="button"
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 max-md:w-10 max-md:h-10 bg-black/40 border border-white/8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/8 hover:border-white/15 hover:text-white/90 transition-all cursor-pointer"
                        onClick={goPrev}
                        aria-label="Previous image"
                      >
                        {ChevronLeft}
                      </button>
                    )}
                    {activeIndex < images.length - 1 && (
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 max-md:w-10 max-md:h-10 bg-black/40 border border-white/8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/8 hover:border-white/15 hover:text-white/90 transition-all cursor-pointer"
                        onClick={goNext}
                        aria-label="Next image"
                      >
                        {ChevronRight}
                      </button>
                    )}
                  </>
                )}

                {/* Dot navigation */}
                {images.length > 1 && (
                  <div className="flex justify-center gap-2.5 pb-3 max-md:pb-2">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                          activeIndex === i
                            ? "bg-white/60 scale-125"
                            : "bg-white/15 hover:bg-white/30"
                        }`}
                        onClick={() => setActiveIndex(i)}
                        aria-label={`View image ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="p-6 max-md:px-4 max-md:py-3.5 md:border-l border-[rgba(255,255,255,0.04)] flex flex-col max-md:items-center">
                {/* Title + Price row on mobile */}
                <div className="flex max-md:items-center max-md:justify-between max-md:w-full md:flex-col md:items-start gap-1 mb-3 max-md:mb-2.5">
                  <h3 className="font-[family-name:var(--font-sans)] text-[15px] max-md:text-[14px] font-bold tracking-[0.02em] uppercase text-white/90">
                    {title}
                  </h3>
                  {discount && discount.type === "percentage" ? (
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-[family-name:var(--font-mono)] text-[11px] max-md:text-[10px] font-medium tracking-[0.02em] text-white/25 line-through">
                        {currencySymbol}{price.toFixed(2)}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-lg max-md:text-base font-bold text-white tracking-[0.02em]">
                        {currencySymbol}{formatPrice(getDiscountedPrice(price, discount))}
                      </span>
                    </div>
                  ) : (
                    <span className="font-[family-name:var(--font-mono)] text-lg max-md:text-base font-bold text-white tracking-[0.02em] shrink-0">
                      {currencySymbol}{price.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* What's included — bundle badges */}
                {ticketName && (
                  <div className="w-full mb-3 max-md:mb-2.5">
                    <div className="flex gap-1.5 max-md:justify-center">
                      <span className="midnight-bundle-badge inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.03em] uppercase text-white/60 whitespace-nowrap">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 shrink-0">
                          <rect x="2" y="7" width="20" height="14" rx="2" />
                          <path d="M16 7V5a4 4 0 0 0-8 0v2" />
                        </svg>
                        Includes Ticket
                      </span>
                      <span className="midnight-bundle-badge inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.03em] uppercase text-white/60 whitespace-nowrap">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 shrink-0">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        Includes Merch
                      </span>
                    </div>
                    {ticketDescription && (
                      <p className="font-[family-name:var(--font-sans)] text-[10px] leading-relaxed text-white/30 mt-2 max-md:text-center">
                        {ticketDescription}
                      </p>
                    )}
                  </div>
                )}

                {/* Merch description — about the physical product */}
                {description && (
                  <p className="font-[family-name:var(--font-sans)] text-[10px] leading-relaxed text-white/35 mb-3 max-md:mb-2.5 max-md:text-center">
                    {description}
                  </p>
                )}

                {/* Size selector */}
                <MidnightSizeSelector
                  sizes={sizes}
                  selectedSize={selectedSize}
                  onSelect={(s) => setSelectedSize(s as TeeSize)}
                />
              </div>

            </div>
          </div>

          {/* ── CTA bar — qty stepper + buttons ── */}
          <div className="shrink-0 px-5 py-3.5 max-md:px-4 max-md:py-3 border-t border-[rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-3">
              {/* Qty stepper — compact */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className="w-9 h-9 max-md:w-10 max-md:h-10 flex items-center justify-center text-sm text-white/35 hover:text-white/60 rounded-lg border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.03)] active:scale-[0.90] transition-all duration-100 cursor-pointer"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                >
                  &minus;
                </button>
                <span className="font-[family-name:var(--font-mono)] text-sm font-bold min-w-[20px] text-center tabular-nums text-white/70">
                  {qty}
                </span>
                <button
                  type="button"
                  className="w-9 h-9 max-md:w-10 max-md:h-10 flex items-center justify-center text-sm text-white/35 hover:text-white/60 rounded-lg border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.03)] active:scale-[0.90] transition-all duration-100 cursor-pointer"
                  onClick={() => setQty(qty + 1)}
                >
                  +
                </button>
              </div>

              {/* CTA button */}
              <button
                type="button"
                className="flex-1 h-11 bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.10)] text-white font-[family-name:var(--font-sans)] text-[13px] max-md:text-xs font-bold tracking-[0.03em] uppercase rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.18)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_0_24px_rgba(255,255,255,0.04)] active:scale-[0.98] transition-all duration-200 cursor-pointer"
                onClick={handleAdd}
              >
                Add to Cart &mdash; {currencySymbol}{formatPrice((discount && discount.type === "percentage" ? getDiscountedPrice(price, discount) : price) * qty)}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen image zoom — separate Radix Dialog ──
           Must be its own Dialog (not a plain overlay or createPortal) because
           the merch modal's Dialog owns a focus trap that captures ALL pointer
           events at the document level, making any element outside DialogContent
           completely unclickable. A second Dialog gets its own focus trap +
           portal, so clicks, swipes, and keyboard all work properly. */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          data-theme="midnight"
          className="inset-0 top-0 left-0 translate-x-0 translate-y-0 max-w-none w-screen h-screen max-h-none bg-black/95 border-none rounded-none p-0 gap-0 overflow-hidden z-[200] [&>button:last-child]:hidden"
        >
          <DialogTitle className="sr-only">Zoomed image</DialogTitle>
          <DialogDescription className="sr-only">
            Full screen view. Tap image or press Escape to close.
          </DialogDescription>

          {/* Interactive layer — handles background click + swipe */}
          <div
            className="w-full h-full flex items-center justify-center relative"
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              if (fsDidSwipe.current) { fsDidSwipe.current = false; return; }
              setFullscreenOpen(false);
            }}
            onTouchStart={onFsTouchStart}
            onTouchEnd={onFsTouchEnd}
          >
            {/* Close button — high contrast so it's unmissable on any device */}
            <button
              type="button"
              className="absolute right-4 z-20 w-11 h-11 bg-white/15 border border-white/30 rounded-full flex items-center justify-center text-white hover:bg-white/25 hover:border-white/40 transition-all cursor-pointer backdrop-blur-sm"
              style={{ top: "calc(12px + env(safe-area-inset-top, 0px))" }}
              onClick={() => setFullscreenOpen(false)}
              aria-label="Close zoom"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Navigation arrows */}
            {images.length > 1 && fullscreenIndex > 0 && (
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 border border-white/15 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/10 hover:border-white/25 transition-all z-10 cursor-pointer"
                onClick={() => setFullscreenIndex(fullscreenIndex - 1)}
                aria-label="Previous"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </button>
            )}
            {images.length > 1 && fullscreenIndex < images.length - 1 && (
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 border border-white/15 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/10 hover:border-white/25 transition-all z-10 cursor-pointer"
                onClick={() => setFullscreenIndex(fullscreenIndex + 1)}
                aria-label="Next"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,6 15,12 9,18" />
                </svg>
              </button>
            )}

            {/* Zoomed image — tap to zoom out */}
            {images[fullscreenIndex] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={images[fullscreenIndex].src}
                alt={images[fullscreenIndex].alt}
                className="max-w-[85vw] max-h-[85vh] object-contain cursor-zoom-out"
                style={{ maxHeight: "85dvh" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (fsDidSwipe.current) { fsDidSwipe.current = false; return; }
                  setFullscreenOpen(false);
                }}
              />
            )}

            {/* Dot indicators */}
            {images.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2.5 z-10">
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                      i === fullscreenIndex ? "bg-white" : "bg-white/25"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenIndex(i);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
