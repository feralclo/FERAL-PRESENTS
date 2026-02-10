"use client";

import { useState, useCallback } from "react";
import type { TeeSize } from "@/types/tickets";
import { TEE_SIZES } from "@/types/tickets";

interface TeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (size: TeeSize, qty: number) => void;
}

const IMAGES = [
  {
    view: "back",
    src: "/images/LIVERPOOL MARCH BACK.png",
    alt: "FERAL Liverpool Tee Back",
  },
  {
    view: "front",
    src: "/images/LIVERPOOL MARCH FRONT.png",
    alt: "FERAL Liverpool Tee Front",
  },
];

export function TeeModal({ isOpen, onClose, onAddToCart }: TeeModalProps) {
  const [activeView, setActiveView] = useState("back");
  const [selectedSize, setSelectedSize] = useState<TeeSize>("M");
  const [qty, setQty] = useState(1);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  const handleAdd = useCallback(() => {
    onAddToCart(selectedSize, qty);
    onClose();
    setQty(1);
  }, [selectedSize, qty, onAddToCart, onClose]);

  const openFullscreen = useCallback(
    (view: string) => {
      const idx = IMAGES.findIndex((img) => img.view === view);
      setFullscreenIndex(idx >= 0 ? idx : 0);
      setFullscreenOpen(true);
    },
    []
  );

  if (!isOpen && !fullscreenOpen) return null;

  return (
    <>
      {/* Tee Modal */}
      {isOpen && (
        <div
          className="tee-modal-overlay"
          style={{ display: "flex" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="tee-modal">
            <button className="tee-modal__close" onClick={onClose}>
              &times;
            </button>

            <div className="tee-modal__header">
              <div className="tee-modal__legendary">
                <span className="tee-modal__legendary-icon" />
                <span className="tee-modal__legendary-tag">
                  Event Exclusive
                </span>
              </div>
              <span className="tee-modal__title">
                Liverpool March 2026 Tee
              </span>
            </div>

            <div className="tee-modal__viewer">
              <div className="tee-modal__image-tabs">
                {IMAGES.map((img) => (
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
                {IMAGES.map((img) => (
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
              <p className="tee-modal__exclusive-text">
                This design exists only for Liverpool March 2026. Once
                they&apos;re gone, they&apos;re gone forever.
              </p>
              <div className="tee-modal__badges">
                <span className="tee-modal__badge">Limited Edition</span>
                <span className="tee-modal__badge">Collector&apos;s Piece</span>
                <span className="tee-modal__badge tee-modal__badge--vip">
                  Includes VIP Tickets — Liverpool March 2026
                </span>
              </div>
            </div>

            <div className="tee-modal__sizes">
              <span className="tee-modal__sizes-label">Select Size</span>
              <div className="tee-modal__size-options">
                {TEE_SIZES.map((size) => (
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
                Add to Cart &mdash; &pound;{(65 * qty).toFixed(0)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zoom */}
      {fullscreenOpen && (
        <div
          className="tee-modal__fullscreen"
          style={{ display: "flex" }}
          onClick={() => setFullscreenOpen(false)}
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
                (fullscreenIndex - 1 + IMAGES.length) % IMAGES.length
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
              setFullscreenIndex((fullscreenIndex + 1) % IMAGES.length);
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
            src={IMAGES[fullscreenIndex].src}
            alt={IMAGES[fullscreenIndex].alt}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="tee-modal__fullscreen-dots">
            {IMAGES.map((_, i) => (
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
