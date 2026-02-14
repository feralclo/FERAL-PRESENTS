"use client";

import { useState } from "react";
import {
  AuroraDialog,
  AuroraDialogContent,
  AuroraDialogHeader,
  AuroraDialogTitle,
  AuroraDialogClose,
} from "./ui/dialog";
import { AuroraButton } from "./ui/button";
import { AuroraBadge } from "./ui/badge";

interface AuroraMerchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (size: string, qty: number) => void;
  merchName: string;
  merchDescription?: string;
  merchImages?: { front?: string; back?: string };
  merchPrice: number;
  currencySymbol: string;
  availableSizes?: string[];
  vipBadge?: string;
}

export function AuroraMerchModal({
  isOpen,
  onClose,
  onAddToCart,
  merchName,
  merchDescription,
  merchImages,
  merchPrice,
  currencySymbol,
  availableSizes,
  vipBadge,
}: AuroraMerchModalProps) {
  const [selectedSize, setSelectedSize] = useState("M");
  const [activeImage, setActiveImage] = useState<"front" | "back">("front");
  const sizes = availableSizes || ["XS", "S", "M", "L", "XL", "XXL"];
  const priceDisplay = merchPrice % 1 === 0 ? merchPrice.toString() : merchPrice.toFixed(2);

  const imageSrc =
    activeImage === "front"
      ? merchImages?.front
      : merchImages?.back;

  const handleAdd = () => {
    onAddToCart(selectedSize, 1);
    onClose();
  };

  return (
    <AuroraDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AuroraDialogContent className="max-w-md">
        <AuroraDialogHeader>
          <div className="flex items-center justify-between">
            <AuroraDialogTitle>{merchName}</AuroraDialogTitle>
            <AuroraDialogClose className="text-aurora-text-secondary hover:text-aurora-text text-xl">
              &times;
            </AuroraDialogClose>
          </div>
        </AuroraDialogHeader>

        <div className="space-y-4 mt-4">
          {/* Image */}
          {(merchImages?.front || merchImages?.back) && (
            <div>
              <div className="relative aspect-square rounded-xl overflow-hidden bg-aurora-surface">
                {imageSrc && (
                  <img
                    src={imageSrc}
                    alt={merchName}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              {merchImages?.front && merchImages?.back && (
                <div className="flex justify-center gap-2 mt-3">
                  <button
                    className={`rounded-lg border px-3 py-1 text-xs transition-all ${
                      activeImage === "front"
                        ? "border-primary text-primary"
                        : "border-aurora-border text-aurora-text-secondary"
                    }`}
                    onClick={() => setActiveImage("front")}
                  >
                    Front
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-1 text-xs transition-all ${
                      activeImage === "back"
                        ? "border-primary text-primary"
                        : "border-aurora-border text-aurora-text-secondary"
                    }`}
                    onClick={() => setActiveImage("back")}
                  >
                    Back
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VIP badge */}
          {vipBadge && (
            <AuroraBadge variant="vip">{vipBadge}</AuroraBadge>
          )}

          {/* Description */}
          {merchDescription && (
            <p className="text-sm text-aurora-text-secondary">{merchDescription}</p>
          )}

          {/* Price */}
          <div className="text-xl font-bold text-aurora-text">
            {currencySymbol}{priceDisplay}
          </div>

          {/* Size selector */}
          <div>
            <p className="text-xs text-aurora-text-secondary mb-2 uppercase tracking-wider">
              Select Size
            </p>
            <div className="grid grid-cols-3 gap-2">
              {sizes.map((size) => (
                <button
                  key={size}
                  className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                    selectedSize === size
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-aurora-border text-aurora-text-secondary hover:border-aurora-text/30"
                  }`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Add to cart */}
          <AuroraButton
            variant="primary"
            size="lg"
            glow
            className="w-full"
            onClick={handleAdd}
          >
            Add to Cart &mdash; {currencySymbol}{priceDisplay}
          </AuroraButton>
        </div>
      </AuroraDialogContent>
    </AuroraDialog>
  );
}
