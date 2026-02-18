"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MidnightSizeSelector } from "./MidnightSizeSelector";
import type { TeeSize } from "@/types/tickets";
import { TEE_SIZES } from "@/types/tickets";

interface MidnightMerchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (size: TeeSize, qty: number) => void;
  merchName?: string;
  merchDescription?: string;
  merchImages?: { front?: string; back?: string };
  merchPrice?: number;
  currencySymbol?: string;
  availableSizes?: string[];
  ticketName?: string;
  ticketDescription?: string;
  vipBadge?: string;
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
}: MidnightMerchModalProps) {
  const images = useMemo(() => {
    const imgs: { view: string; src: string; alt: string }[] = [];
    if (merchImages?.back) {
      imgs.push({ view: "back", src: merchImages.back, alt: `${merchName || "Merch"} Back` });
    }
    if (merchImages?.front) {
      imgs.push({ view: "front", src: merchImages.front, alt: `${merchName || "Merch"} Front` });
    }
    return imgs;
  }, [merchImages, merchName]);

  const title = merchName || "Event Merch";
  const description = merchDescription || "";
  const price = merchPrice ?? 0;
  const sizes = (availableSizes || TEE_SIZES) as TeeSize[];

  // Build the inclusion headline
  const inclusionHeadline = ticketName
    ? `Includes ${ticketName} + T-Shirt`
    : vipBadge || "Includes Event Ticket + T-Shirt";

  const [activeView, setActiveView] = useState("back");
  const [selectedSize, setSelectedSize] = useState<TeeSize>(
    sizes.includes("M" as TeeSize) ? ("M" as TeeSize) : sizes[0]
  );
  const [qty, setQty] = useState(1);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  const touchStartX = useRef(0);

  useEffect(() => {
    if (images.length > 0) {
      setActiveView(images[0].view);
    }
  }, [images]);

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

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(delta) > 50) {
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
    (view: string) => {
      const idx = images.findIndex((img) => img.view === view);
      setFullscreenIndex(idx >= 0 ? idx : 0);
      setFullscreenOpen(true);
    },
    [images]
  );

  return (
    <>
      {/* ── Product modal ─────────────────────── */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          data-theme="midnight"
          className="midnight-merch-dialog max-w-[420px] md:max-w-[680px] max-h-[85vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Merch details and size selection for {title}
          </DialogDescription>

          {/* ── Scrollable content ─────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="md:grid md:grid-cols-[1.1fr_1fr]">

              {/* Image area */}
              <div className="relative bg-white/[0.04]">
                <div className="flex justify-center items-center px-6 pt-12 pb-3 max-md:px-5 max-md:pt-8 max-md:pb-1.5 min-h-[280px] max-md:min-h-[170px] max-[380px]:min-h-[140px]">
                  {images.length > 0 ? (
                    images.map((img) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={img.view}
                        src={img.src}
                        alt={img.alt}
                        className={`max-w-[300px] max-md:max-w-[200px] max-[380px]:max-w-[160px] max-h-[320px] max-md:max-h-[200px] max-[380px]:max-h-[160px] w-auto h-auto object-contain cursor-zoom-in transition-opacity duration-300 ${
                          activeView === img.view ? "block opacity-100" : "hidden opacity-0"
                        }`}
                        onClick={() => openFullscreen(img.view)}
                      />
                    ))
                  ) : (
                    <div className="w-[140px] h-[140px] rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-[rgba(255,255,255,0.2)] uppercase tracking-[0.1em]">No image</span>
                    </div>
                  )}
                </div>

                {/* Dot navigation */}
                {images.length > 1 && (
                  <div className="flex justify-center gap-2.5 pb-3 max-md:pb-2">
                    {images.map((img) => (
                      <button
                        key={img.view}
                        type="button"
                        className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                          activeView === img.view
                            ? "bg-white/60 scale-125"
                            : "bg-white/15 hover:bg-white/30"
                        }`}
                        onClick={() => setActiveView(img.view)}
                        aria-label={`View ${img.view}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="p-6 max-md:px-4 max-md:py-3.5 md:border-l border-[rgba(255,255,255,0.06)] flex flex-col max-md:items-center">
                {/* Title + Price row on mobile */}
                <div className="flex max-md:items-center max-md:justify-between max-md:w-full md:flex-col md:items-start gap-1 mb-3 max-md:mb-2.5">
                  <h3 className="font-[family-name:var(--font-sans)] text-[15px] max-md:text-[14px] font-bold tracking-[0.02em] uppercase text-white/90">
                    {title}
                  </h3>
                  <span className="font-[family-name:var(--font-mono)] text-lg max-md:text-base font-bold text-white tracking-[0.02em] shrink-0">
                    {currencySymbol}{price.toFixed(2)}
                  </span>
                </div>

                {/* What's included — compact glass container */}
                <div className="w-full rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] p-3 max-md:p-2.5 mb-4 max-md:mb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="font-[family-name:var(--font-sans)] text-[11px] font-bold tracking-[0.02em] text-white/80 max-md:text-center">
                    {inclusionHeadline}
                  </p>
                  {ticketDescription && (
                    <p className="font-[family-name:var(--font-sans)] text-[10px] leading-relaxed text-white/30 mt-0.5 max-md:text-center">
                      {ticketDescription}
                    </p>
                  )}
                  {!ticketDescription && description && (
                    <p className="font-[family-name:var(--font-sans)] text-[10px] leading-relaxed text-white/30 mt-0.5 max-md:text-center">
                      {description}
                    </p>
                  )}
                </div>

                {/* Size selector */}
                <MidnightSizeSelector
                  sizes={sizes}
                  selectedSize={selectedSize}
                  onSelect={(s) => setSelectedSize(s as TeeSize)}
                />
              </div>

            </div>
          </div>

          {/* ── CTA bar — qty stepper + frosted glass button ── */}
          <div className="shrink-0 px-5 py-3.5 max-md:px-4 max-md:py-3 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-3">
              {/* Qty stepper — compact */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-sm text-white/35 hover:text-white/60 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.04)] active:scale-[0.90] transition-all duration-100 cursor-pointer"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                >
                  &minus;
                </button>
                <span className="font-[family-name:var(--font-mono)] text-sm font-bold min-w-[20px] text-center tabular-nums text-white/70">
                  {qty}
                </span>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-sm text-white/35 hover:text-white/60 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.04)] active:scale-[0.90] transition-all duration-100 cursor-pointer"
                  onClick={() => setQty(qty + 1)}
                >
                  +
                </button>
              </div>

              {/* CTA button */}
              <button
                type="button"
                className="flex-1 h-11 bg-[rgba(255,255,255,0.12)] border border-[rgba(255,255,255,0.18)] text-white font-[family-name:var(--font-sans)] text-[13px] max-md:text-xs font-bold tracking-[0.03em] uppercase rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.18)] hover:border-[rgba(255,255,255,0.25)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_24px_rgba(255,255,255,0.05)] active:scale-[0.98] transition-all duration-200 cursor-pointer"
                onClick={handleAdd}
              >
                Add to Cart &mdash; {currencySymbol}{(price * qty).toFixed(2)}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen image zoom ─────────────── */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          data-theme="midnight"
          className="midnight-merch-dialog max-w-[90vw] max-h-[90vh] p-0 bg-black/97 border-none flex items-center justify-center cursor-zoom-out rounded-2xl"
          onClick={() => setFullscreenOpen(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <DialogTitle className="sr-only">Image zoom</DialogTitle>
          <DialogDescription className="sr-only">Fullscreen image view</DialogDescription>

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/50 border border-white/15 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/10 hover:border-white/25 transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex((fullscreenIndex - 1 + images.length) % images.length);
                }}
                aria-label="Previous"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/50 border border-white/15 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/10 hover:border-white/25 transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex((fullscreenIndex + 1) % images.length);
                }}
                aria-label="Next"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,6 15,12 9,18" />
                </svg>
              </button>
            </>
          )}

          {images[fullscreenIndex] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={images[fullscreenIndex].src}
              alt={images[fullscreenIndex].alt}
              className="max-w-[85vw] max-h-[85vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}

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
        </DialogContent>
      </Dialog>
    </>
  );
}
