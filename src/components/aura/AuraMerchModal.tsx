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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navImage(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navImage(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
                >
                  <ChevronRight size={16} />
                </Button>
              </>
            )}
            {/* Dots */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((img) => (
                  <button
                    key={img.key}
                    onClick={() => setActiveImage(img.key as "front" | "back")}
                    className={`h-1.5 rounded-full transition-all ${
                      img.key === activeImage
                        ? "w-4 bg-primary"
                        : "w-1.5 bg-muted-foreground/30"
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
                <Badge variant="secondary" className="text-xs">
                  <Sparkles size={10} />
                  {vipBadge}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-lg tracking-tight">
              {merchName}
            </DialogTitle>
            {merchDescription && (
              <DialogDescription className="text-sm leading-relaxed">
                {merchDescription}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Price */}
          <p className="text-2xl font-bold tabular-nums">
            {currencySymbol}{merchPrice.toFixed(2)}
          </p>

          <Separator />

          {/* Size selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</p>
            <div className="grid grid-cols-3 gap-2">
              {availableSizes.map((size) => (
                <Button
                  key={size}
                  variant={selectedSize === size ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSize(size)}
                  className="w-full"
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          {/* Add to cart */}
          <Button
            className="w-full font-semibold"
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
