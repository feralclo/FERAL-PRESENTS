"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { normalizeMerchImages } from "@/lib/merch-images";
import type { TeeSize } from "@/types/tickets";
import { TEE_SIZES } from "@/types/tickets";

interface TeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (size: TeeSize, qty: number) => void;
  /** Merch product name */
  merchName?: string;
  /** Merch description copy */
  merchDescription?: string;
  /** Merch image URLs (string[] or legacy {front, back}) */
  merchImages?: string[] | { front?: string; back?: string };
  /** Price per item for the "Add to Cart" button */
  merchPrice?: number;
  /** Currency symbol (default: "£") */
  currencySymbol?: string;
  /** Available sizes (default: TEE_SIZES) */
  availableSizes?: string[];
  /** VIP badge text */
  vipBadge?: string;
}

export function TeeModal({
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
}: TeeModalProps) {
  // Build image array from props (handles both legacy {front,back} and string[])
  const images = useMemo(() => {
    return normalizeMerchImages(merchImages).map((src, i) => ({
      view: String(i),
      src,
      alt: `${merchName || "Merch"} ${i + 1}`,
    }));
  }, [merchImages, merchName]);

  const title = merchName || "Event Merch";
  const description =
    merchDescription ||
    "Exclusive event merchandise. Once they\u2019re gone, they\u2019re gone forever.";
  const price = merchPrice ?? 0;
  const vipText =
    vipBadge || "Includes VIP Tickets";
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

  // Keyboard navigation (ArrowLeft, ArrowRight, Escape)
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

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen && !fullscreenOpen) return null;

  return (
    <>
      {/* Tee Modal */}
      {isOpen && (
        <div
          className="tee-modal-overlay tee-modal-overlay--visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="tee-modal">
            <div className="tee-modal__drag-handle" />
            <button className="tee-modal__close" onClick={onClose} aria-label="Close">
              &times;
            </button>

            <div className="tee-modal__header">
              <div className="tee-modal__legendary">
                <span className="tee-modal__legendary-icon" />
                <span className="tee-modal__legendary-tag">
                  Event Exclusive
                </span>
              </div>
              <span className="tee-modal__title">{title}</span>
            </div>

            <div className="tee-modal__viewer">
              <div className="tee-modal__image-tabs">
                {images.map((img) => (
                  <button
                    key={img.view}
                    className={`tee-modal__tab ${
                      activeView === img.view ? "tee-modal__tab--active" : ""
                    }`}
                    onClick={() => setActiveView(img.view)}
                  >
                    {img.view.charAt(0).toUpperCase() + img.view.slice(1)}
                  </button>
                ))}
              </div>
              <div className="tee-modal__image-container">
                {images.map((img) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={img.view}
                    src={img.src}
                    alt={img.alt}
                    className={`tee-modal__img ${
                      activeView === img.view ? "tee-modal__img--active" : ""
                    }`}
                    data-view={img.view}
                    onClick={() => openFullscreen(img.view)}
                  />
                ))}
                <span className="tee-modal__zoom-hint">Click to zoom</span>
              </div>
            </div>

            <div className="tee-modal__exclusive">
              <div className="tee-modal__exclusive-headline">
                One-Time Drop. Never Again.
              </div>
              <p className="tee-modal__exclusive-text">{description}</p>
              <div className="tee-modal__badges">
                <span className="tee-modal__badge">Limited Edition</span>
                <span className="tee-modal__badge">
                  Collector&apos;s Piece
                </span>
                <span className="tee-modal__badge tee-modal__badge--vip">
                  {vipText}
                </span>
              </div>
            </div>

            <div className="tee-modal__sizes">
              <span className="tee-modal__sizes-label">Select Size</span>
              <div className="tee-modal__size-options">
                {sizes.map((size) => (
                  <button
                    key={size}
                    className={`tee-modal__size ${
                      selectedSize === size ? "tee-modal__size--selected" : ""
                    }`}
                    onClick={() => setSelectedSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="tee-modal__cart">
              <div className="tee-modal__qty-controls">
                <button
                  className="tee-modal__qty-btn"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                >
                  &minus;
                </button>
                <span className="tee-modal__qty-value">{qty}</span>
                <button
                  className="tee-modal__qty-btn"
                  onClick={() => setQty(qty + 1)}
                >
                  +
                </button>
              </div>
              <button className="tee-modal__add-btn" onClick={handleAdd}>
                Add to Cart &mdash; {currencySymbol}
                {(price * qty).toFixed(0)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zoom */}
      {fullscreenOpen && (
        <div
          className="tee-modal__fullscreen tee-modal__fullscreen--visible"
          onClick={() => setFullscreenOpen(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            className="tee-modal__fullscreen-close"
            onClick={() => setFullscreenOpen(false)}
            aria-label="Close"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <button
            className="tee-modal__fullscreen-nav tee-modal__fullscreen-nav--prev"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenIndex(
                (fullscreenIndex - 1 + images.length) % images.length
              );
            }}
            aria-label="Previous"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
          <button
            className="tee-modal__fullscreen-nav tee-modal__fullscreen-nav--next"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenIndex((fullscreenIndex + 1) % images.length);
            }}
            aria-label="Next"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9,6 15,12 9,18" />
            </svg>
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[fullscreenIndex].src}
            alt={images[fullscreenIndex].alt}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="tee-modal__fullscreen-dots">
            {images.map((_, i) => (
              <span
                key={i}
                className={`tee-modal__fullscreen-dot ${
                  i === fullscreenIndex
                    ? "tee-modal__fullscreen-dot--active"
                    : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex(i);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
