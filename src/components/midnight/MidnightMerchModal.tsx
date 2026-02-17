"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <DialogContent className="max-w-[480px] md:max-w-[800px] max-h-[90vh] md:max-h-[85vh] overflow-y-auto overflow-x-hidden p-0 gap-0 rounded-2xl">
          {/* Header */}
          <DialogHeader className="p-5 pb-4 text-center border-b border-foreground/[0.05] md:col-span-2">
            <div className="flex justify-center mb-3">
              <div className="midnight-legendary-badge">
                <span className="midnight-diamond-icon w-4 h-4 flex items-center justify-center" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.2em] text-platinum uppercase">
                  Event Exclusive
                </span>
              </div>
            </div>
            <DialogTitle className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-[0.12em] uppercase">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Merch details and size selection for {title}
            </DialogDescription>
          </DialogHeader>

          {/* Desktop: 2-column, Mobile: single column */}
          <div className="md:grid md:grid-cols-2">
            {/* Image viewer */}
            <div className="midnight-merch-viewer md:row-span-2">
              {/* Image tabs */}
              <div className="flex justify-center gap-1 px-5 pt-4">
                {images.map((img) => (
                  <button
                    key={img.view}
                    className={`font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[1.5px] uppercase px-5 py-2 border rounded-md transition-all
                      ${activeView === img.view
                        ? "bg-primary/10 border-primary/30 text-foreground"
                        : "bg-foreground/[0.03] border-foreground/[0.06] text-muted-foreground/60 hover:bg-foreground/[0.06] hover:text-muted-foreground"
                      }`}
                    onClick={() => setActiveView(img.view)}
                  >
                    {img.view.charAt(0).toUpperCase() + img.view.slice(1)}
                  </button>
                ))}
              </div>

              {/* Image */}
              <div className="flex justify-center items-center p-6 max-md:p-4 min-h-[340px] max-md:min-h-[200px] max-[380px]:min-h-[160px] relative">
                {images.map((img) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={img.view}
                    src={img.src}
                    alt={img.alt}
                    className={`max-w-[320px] max-md:max-w-[220px] max-[380px]:max-w-[180px] max-h-[380px] max-md:max-h-[260px] max-[380px]:max-h-[220px] w-auto h-auto object-contain cursor-zoom-in relative z-[1] transition-all duration-300
                      ${activeView === img.view ? "block" : "hidden"}`}
                    style={{
                      filter: `drop-shadow(0 0 30px color-mix(in srgb, var(--color-primary) 50%, transparent))`,
                    }}
                    onClick={() => openFullscreen(img.view)}
                  />
                ))}
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[8px] tracking-[0.08em] text-muted-foreground/40 uppercase z-[2]">
                  Tap to zoom
                </span>
              </div>
            </div>

            {/* Exclusivity section */}
            <div className="p-5 max-md:p-4 border-t md:border-t-0 md:border-l border-foreground/[0.04] md:flex md:flex-col md:justify-center">
              <div className="font-[family-name:var(--font-display)] text-sm max-md:text-[13px] font-bold tracking-[0.01em] text-foreground/90 mb-2 max-md:text-center">
                One-Time Drop. Never Again.
              </div>
              <p className="font-[family-name:var(--font-display)] text-[11px] leading-relaxed text-muted-foreground/60 mb-4 max-md:text-center max-w-[320px] max-md:mx-auto">
                {description}
              </p>
              <div className="flex gap-2 max-md:justify-center flex-wrap">
                <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.1em] uppercase text-platinum/80 bg-platinum/[0.04] border-platinum/20 px-2.5 py-1 rounded-md">
                  Limited Edition
                </Badge>
                <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.1em] uppercase text-platinum/80 bg-platinum/[0.04] border-platinum/20 px-2.5 py-1 rounded-md">
                  Collector&apos;s Piece
                </Badge>
                <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[8px] tracking-[0.1em] uppercase text-[#F5A623]/80 bg-[rgba(245,166,35,0.04)] border-[rgba(245,166,35,0.2)] px-2.5 py-1 rounded-md">
                  {vipText}
                </Badge>
              </div>
            </div>

            {/* Size selector */}
            <div className="p-4 max-md:p-3 border-t md:border-t-0 md:border-l border-foreground/[0.04]">
              <span className="block font-[family-name:var(--font-mono)] text-[8px] tracking-[0.15em] uppercase text-muted-foreground/50 text-center mb-3 max-md:mb-2.5">
                Select Size
              </span>
              <MidnightSizeSelector
                sizes={sizes}
                selectedSize={selectedSize}
                onSelect={(s) => setSelectedSize(s as TeeSize)}
                variant="platinum"
              />
            </div>
          </div>

          {/* Cart controls — sticky on mobile */}
          <div className="p-5 max-md:p-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom))] bg-foreground/[0.02] border-t border-foreground/[0.05] flex flex-col md:flex-row items-center justify-between gap-4 max-md:sticky max-md:bottom-0 max-md:bg-[rgba(10,10,12,0.95)] max-md:backdrop-blur-[16px]">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="w-10 h-10 text-lg bg-platinum/8 border-platinum/25 text-platinum hover:bg-platinum/15 hover:border-platinum/50 rounded-lg"
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                &minus;
              </Button>
              <span className="font-[family-name:var(--font-mono)] text-xl font-bold min-w-[32px] text-center tabular-nums">
                {qty}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="w-10 h-10 text-lg bg-platinum/8 border-platinum/25 text-platinum hover:bg-platinum/15 hover:border-platinum/50 rounded-lg"
                onClick={() => setQty(qty + 1)}
              >
                +
              </Button>
            </div>
            <Button
              className="midnight-metallic-cta w-full md:w-auto md:min-w-[200px] py-4 px-6 max-md:py-3.5 font-[family-name:var(--font-mono)] text-xs max-md:text-[11px] rounded-xl"
              onClick={handleAdd}
            >
              Add to Cart &mdash; {currencySymbol}
              {(price * qty).toFixed(0)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen zoom */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          className="max-w-[90vw] max-h-[90vh] p-0 bg-black/97 border-none flex items-center justify-center cursor-zoom-out rounded-2xl"
          onClick={() => setFullscreenOpen(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <DialogTitle className="sr-only">Image zoom</DialogTitle>
          <DialogDescription className="sr-only">Fullscreen image view</DialogDescription>

          {images.length > 1 && (
            <>
              <button
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
              className="max-w-[90vw] max-h-[90vh] object-contain"
              style={{ filter: `drop-shadow(0 0 50px color-mix(in srgb, var(--color-primary) 40%, transparent))` }}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {images.length > 1 && (
            <div className="absolute bottom-[28px] left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all cursor-pointer
                    ${i === fullscreenIndex
                      ? "bg-foreground"
                      : "bg-foreground/25"
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
