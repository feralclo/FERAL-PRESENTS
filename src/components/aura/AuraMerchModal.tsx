"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface AuraMerchModalProps {
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

export function AuraMerchModal({
  isOpen,
  onClose,
  onAddToCart,
  merchName,
  merchDescription,
  merchImages,
  merchPrice,
  currencySymbol,
  availableSizes = ["XS", "S", "M", "L", "XL", "XXL"],
  vipBadge,
}: AuraMerchModalProps) {
  const [selectedSize, setSelectedSize] = useState("M");
  const [activeImage, setActiveImage] = useState<"front" | "back">("front");

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSize(availableSizes.includes("M") ? "M" : availableSizes[0] || "M");
      setActiveImage("front");
    }
  }, [isOpen, availableSizes]);

  const images = useMemo(() => {
    const list: { key: string; src: string }[] = [];
    if (merchImages?.front) list.push({ key: "front", src: merchImages.front });
    if (merchImages?.back) list.push({ key: "back", src: merchImages.back });
    return list;
  }, [merchImages]);

  const currentImage = images.find((img) => img.key === activeImage) || images[0];
  const currentIndex = images.findIndex((img) => img.key === activeImage);

  const navImage = useCallback(
    (dir: 1 | -1) => {
      if (images.length <= 1) return;
      const next = (currentIndex + dir + images.length) % images.length;
      setActiveImage(images[next].key as "front" | "back");
    },
    [images, currentIndex]
  );

  const handleAdd = () => {
    onAddToCart(selectedSize, 1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Image section */}
        {currentImage && (
          <div className="relative bg-card aspect-square sm:aspect-[4/3] overflow-hidden">
            <img
              src={currentImage.src}
              alt={merchName}
              className="h-full w-full object-contain p-4"
            />
            {/* Nav arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => navImage(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 backdrop-blur-sm p-1.5 text-foreground/70 hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => navImage(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 backdrop-blur-sm p-1.5 text-foreground/70 hover:text-foreground transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            {/* Dots */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((img) => (
                  <button
                    key={img.key}
                    onClick={() => setActiveImage(img.key as "front" | "back")}
                    className={`h-1.5 w-1.5 rounded-full transition-all ${
                      img.key === activeImage ? "bg-primary w-4" : "bg-foreground/30"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info section */}
        <div className="p-5 space-y-4">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2 mb-1">
              {vipBadge && (
                <Badge className="bg-primary/15 text-primary border-primary/25 text-[10px]">
                  <Sparkles size={10} />
                  {vipBadge}
                </Badge>
              )}
            </div>
            <DialogTitle className="font-display text-lg tracking-tight">
              {merchName}
            </DialogTitle>
            {merchDescription && (
              <DialogDescription className="text-sm leading-relaxed">
                {merchDescription}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Price */}
          <p className="font-display text-2xl font-bold tabular-nums">
            {currencySymbol}{merchPrice.toFixed(2)}
          </p>

          <Separator className="opacity-30" />

          {/* Size selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</p>
            <div className="grid grid-cols-3 gap-2">
              {availableSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`rounded-lg border py-2 text-sm font-medium transition-all ${
                    selectedSize === size
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Add to cart */}
          <Button
            className="w-full aura-press rounded-full font-semibold"
            onClick={handleAdd}
          >
            <ShoppingCart size={14} />
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
