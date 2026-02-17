"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const description = merchDescription || "Exclusive event merchandise. Once they\u2019re gone, they\u2019re gone forever.";
  const price = merchPrice ?? 0;
  const vipText = vipBadge || "Includes VIP Tickets";
  const sizes = (availableSizes || TEE_SIZES) as TeeSize[];

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
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="midnight-merch-dialog max-w-[420px] md:max-w-[720px] max-h-[85vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col">
          {/* Accessibility — sr-only */}
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Merch details and size selection for {title}
          </DialogDescription>

          {/* ── Scrollable content ─────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="md:grid md:grid-cols-[1.1fr_1fr]">

              {/* Image — the hero of the popup */}
              <div className="midnight-merch-viewer relative">
                <div className="flex justify-center items-center px-6 pt-12 pb-3 max-md:px-5 max-md:pt-11 max-md:pb-2 min-h-[280px] max-md:min-h-[220px] max-[380px]:min-h-[160px]">
                  {images.length > 0 ? (
                    images.map((img) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={img.view}
                        src={img.src}
                        alt={img.alt}
                        className={`max-w-[300px] max-md:max-w-[220px] max-[380px]:max-w-[170px] max-h-[320px] max-md:max-h-[240px] max-[380px]:max-h-[180px] w-auto h-auto object-contain cursor-zoom-in transition-opacity duration-300 ${
                          activeView === img.view ? "block opacity-100" : "hidden opacity-0"
                        }`}
                        style={{
                          filter: `drop-shadow(0 0 24px color-mix(in srgb, var(--color-primary) 40%, transparent))`,
                        }}
                        onClick={() => openFullscreen(img.view)}
                      />
                    ))
                  ) : (
                    <div className="w-[160px] h-[160px] rounded-xl bg-foreground/[0.04] border border-foreground/[0.06] flex items-center justify-center">
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/20 uppercase tracking-[0.1em]">No image</span>
                    </div>
                  )}
                </div>

                {/* Dot navigation for front/back */}
                {images.length > 1 && (
                  <div className="flex justify-center gap-2.5 pb-4 max-md:pb-3">
                    {images.map((img) => (
                      <button
                        key={img.view}
                        type="button"
                        className={`w-2 h-2 rounded-full transition-all ${
                          activeView === img.view
                            ? "bg-foreground/60 scale-125"
                            : "bg-foreground/15 hover:bg-foreground/30"
                        }`}
                        onClick={() => setActiveView(img.view)}
                        aria-label={`View ${img.view}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Product info — clean, focused */}
              <div className="p-5 max-md:px-5 max-md:py-4 md:border-l border-foreground/[0.04] flex flex-col justify-center">
                {/* Name + Price */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="font-[family-name:var(--font-sans)] text-sm font-bold tracking-[0.02em] uppercase text-foreground/90">
                    {title}
                  </h3>
                  <span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground tracking-[0.02em] shrink-0">
                    {currencySymbol}{price.toFixed(2)}
                  </span>
                </div>

                {/* VIP inclusion — single quiet line */}
                <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-foreground/25 mb-5 max-md:mb-4">
                  {vipText}
                </p>

                {/* Description — desktop only, subtle */}
                {description && (
                  <p className="hidden md:block font-[family-name:var(--font-sans)] text-[11px] leading-relaxed text-muted-foreground/40 mb-5">
                    {description}
                  </p>
                )}

                {/* Size selector — no label needed, buttons are self-explanatory */}
                <MidnightSizeSelector
                  sizes={sizes}
                  selectedSize={selectedSize}
                  onSelect={(s) => setSelectedSize(s as TeeSize)}
                  variant="platinum"
                />
              </div>

            </div>
          </div>

          {/* ── CTA bar — always visible, outside scroll ── */}
          <div className="shrink-0 px-5 py-4 max-md:px-4 max-md:py-3.5 bg-foreground/[0.02] border-t border-foreground/[0.06] flex items-center gap-3">
            {/* Compact qty stepper */}
            <div className="flex items-center gap-1.5 shrink-0 bg-foreground/[0.03] border border-foreground/[0.06] rounded-lg px-1 py-1">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center text-sm text-foreground/50 hover:text-foreground/80 rounded-md hover:bg-foreground/[0.06] active:scale-[0.90] transition-all duration-100 cursor-pointer"
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                &minus;
              </button>
              <span className="font-[family-name:var(--font-mono)] text-sm font-bold min-w-[24px] text-center tabular-nums text-foreground/80">
                {qty}
              </span>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center text-sm text-foreground/50 hover:text-foreground/80 rounded-md hover:bg-foreground/[0.06] active:scale-[0.90] transition-all duration-100 cursor-pointer"
                onClick={() => setQty(qty + 1)}
              >
                +
              </button>
            </div>
            {/* Add to cart — the main action */}
            <Button
              className="midnight-metallic-cta flex-1 h-12 max-md:h-11 font-[family-name:var(--font-sans)] text-xs max-md:text-[11px] font-bold tracking-[0.04em] uppercase rounded-xl"
              onClick={handleAdd}
            >
              Add to Cart &mdash; {currencySymbol}{(price * qty).toFixed(2)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen image zoom ─────────────── */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
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
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/50 border border-foreground/15 rounded-xl flex items-center justify-center text-foreground/80 hover:bg-foreground/10 hover:border-foreground/25 transition-all z-10"
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
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/50 border border-foreground/15 rounded-xl flex items-center justify-center text-foreground/80 hover:bg-foreground/10 hover:border-foreground/25 transition-all z-10"
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
              style={{ filter: `drop-shadow(0 0 40px color-mix(in srgb, var(--color-primary) 35%, transparent))` }}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2.5 z-10">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                    i === fullscreenIndex ? "bg-foreground" : "bg-foreground/25"
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
