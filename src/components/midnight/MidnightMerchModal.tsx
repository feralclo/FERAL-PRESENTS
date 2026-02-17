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
import { Separator } from "@/components/ui/separator";
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

  // Reset active view when images change
  useEffect(() => {
    if (images.length > 0) {
      setActiveView(images[0].view);
    }
  }, [images]);

  // Keyboard navigation for fullscreen
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
      {/* Main merch modal — Radix Dialog with focus trap + aria-modal */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-[480px] md:max-w-[800px] max-h-[90vh] md:max-h-[85vh] overflow-y-auto overflow-x-hidden p-0 gap-0">
          {/* Header */}
          <DialogHeader className="p-5 pb-4 text-center border-b border-platinum/20 md:col-span-2">
            <div className="flex justify-center mb-3">
              <div className="midnight-legendary-badge">
                <span className="midnight-diamond-icon w-4 h-4 flex items-center justify-center" />
                <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[3px] text-platinum">
                  Event Exclusive
                </span>
              </div>
            </div>
            <DialogTitle className="font-[family-name:var(--font-mono)] text-[13px] font-bold tracking-[2px] uppercase">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Merch details and size selection for {title}
            </DialogDescription>
          </DialogHeader>

          {/* Desktop: 2-column grid, Mobile: single column */}
          <div className="md:grid md:grid-cols-2">
            {/* Image viewer */}
            <div className="midnight-merch-viewer md:row-span-2">
              {/* Image tabs */}
              <div className="flex justify-center gap-1 px-5 pt-4">
                {images.map((img) => (
                  <button
                    key={img.view}
                    className={`font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[1.5px] uppercase px-5 py-2 border transition-all
                      ${activeView === img.view
                        ? "bg-primary/15 border-primary/40 text-foreground"
                        : "bg-foreground/[0.04] border-foreground/10 text-muted-foreground hover:bg-foreground/[0.08] hover:text-muted-foreground"
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
                      filter: `drop-shadow(0 0 35px color-mix(in srgb, var(--color-primary) 60%, transparent))`,
                    }}
                    onClick={() => openFullscreen(img.view)}
                  />
                ))}
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[9px] tracking-[1px] text-muted-foreground uppercase z-[2]">
                  Click to zoom
                </span>
              </div>
            </div>

            {/* Exclusivity section */}
            <div className="p-5 max-md:p-4 border-t md:border-t-0 md:border-l border-foreground/[0.06] md:flex md:flex-col md:justify-center">
              <div className="font-[family-name:var(--font-mono)] text-[13px] max-md:text-[11px] font-bold tracking-[1.5px] uppercase text-foreground mb-2 max-md:text-center">
                One-Time Drop. Never Again.
              </div>
              <p className="font-[family-name:var(--font-mono)] text-[10px] leading-relaxed text-muted-foreground mb-3.5 max-md:text-center max-w-[320px] max-md:mx-auto">
                {description}
              </p>
              <div className="flex gap-3 max-md:justify-center flex-wrap">
                <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[9px] max-md:text-[8px] tracking-[1.5px] max-md:tracking-[1px] uppercase text-platinum bg-platinum/[0.08] border-platinum/25 px-3 max-md:px-2 py-1.5 max-md:py-1">
                  Limited Edition
                </Badge>
                <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[9px] max-md:text-[8px] tracking-[1.5px] max-md:tracking-[1px] uppercase text-platinum bg-platinum/[0.08] border-platinum/25 px-3 max-md:px-2 py-1.5 max-md:py-1">
                  Collector&apos;s Piece
                </Badge>
                <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[9px] max-md:text-[8px] tracking-[1.5px] max-md:tracking-[1px] uppercase text-[#F5A623] bg-[rgba(245,166,35,0.08)] border-[rgba(245,166,35,0.3)] px-3 max-md:px-2 py-1.5 max-md:py-1">
                  {vipText}
                </Badge>
              </div>
            </div>

            {/* Size selector */}
            <div className="p-4 max-md:p-3 border-t md:border-t-0 md:border-l border-foreground/[0.06]">
              <span className="block font-[family-name:var(--font-mono)] text-[9px] tracking-[2px] uppercase text-muted-foreground text-center mb-3 max-md:mb-2.5">
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

          {/* Cart controls */}
          <div className="p-5 max-md:p-3.5 max-md:pb-[calc(14px+env(safe-area-inset-bottom))] bg-platinum/[0.04] border-t border-platinum/20 flex flex-col md:flex-row items-center justify-between gap-3.5 max-md:sticky max-md:bottom-0 max-md:bg-[rgba(10,10,10,0.95)] max-md:backdrop-blur-[12px]">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="w-10 h-10 text-lg bg-platinum/10 border-platinum/35 text-platinum hover:bg-platinum/20 hover:border-platinum"
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                &minus;
              </Button>
              <span className="font-[family-name:var(--font-mono)] text-xl font-bold min-w-[32px] text-center">
                {qty}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="w-10 h-10 text-lg bg-platinum/10 border-platinum/35 text-platinum hover:bg-platinum/20 hover:border-platinum"
                onClick={() => setQty(qty + 1)}
              >
                +
              </Button>
            </div>
            <Button
              className="midnight-metallic-cta w-full md:w-auto md:min-w-[200px] py-4 px-6 max-md:py-3.5 font-[family-name:var(--font-mono)] text-xs max-md:text-[11px] rounded-lg"
              onClick={handleAdd}
            >
              Add to Cart &mdash; {currencySymbol}
              {(price * qty).toFixed(0)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen zoom — nested Dialog */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          className="max-w-[90vw] max-h-[90vh] p-0 bg-black/97 border-none flex items-center justify-center cursor-zoom-out"
          onClick={() => setFullscreenOpen(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <DialogTitle className="sr-only">Image zoom</DialogTitle>
          <DialogDescription className="sr-only">Fullscreen image view</DialogDescription>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                className="absolute left-5 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/60 border border-foreground/20 rounded-full flex items-center justify-center text-foreground hover:bg-foreground/10 hover:border-foreground transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex((fullscreenIndex - 1 + images.length) % images.length);
                }}
                aria-label="Previous"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </button>
              <button
                className="absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/60 border border-foreground/20 rounded-full flex items-center justify-center text-foreground hover:bg-foreground/10 hover:border-foreground transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex((fullscreenIndex + 1) % images.length);
                }}
                aria-label="Next"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,6 15,12 9,18" />
                </svg>
              </button>
            </>
          )}

          {/* Image */}
          {images[fullscreenIndex] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={images[fullscreenIndex].src}
              alt={images[fullscreenIndex].alt}
              className="max-w-[90vw] max-h-[90vh] object-contain"
              style={{ filter: `drop-shadow(0 0 60px color-mix(in srgb, var(--color-primary) 50%, transparent))` }}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {/* Dots indicator */}
          {images.length > 1 && (
            <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 flex gap-2.5 z-10">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer
                    ${i === fullscreenIndex
                      ? "bg-foreground border-foreground"
                      : "bg-foreground/30 border-foreground/40"
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
