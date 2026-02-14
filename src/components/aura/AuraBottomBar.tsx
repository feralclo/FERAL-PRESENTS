"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";

interface AuraBottomBarProps {
  fromPrice: string;
  cartTotal?: string;
  cartQty: number;
  onBuyNow: () => void;
  onCheckout?: () => void;
}

export function AuraBottomBar({
  fromPrice,
  cartTotal,
  cartQty,
  onBuyNow,
  onCheckout,
}: AuraBottomBarProps) {
  const hasCart = cartQty > 0 && cartTotal;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div className="border-t border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-3 transition-all duration-200">
          {/* Price / Cart info */}
          <div className="min-w-0 flex-1">
            <div
              className={`transition-all duration-200 ${
                hasCart ? "opacity-100" : "opacity-0 absolute pointer-events-none"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Badge variant="default" className="gap-1.5">
                  <ShoppingCart size={12} />
                  {cartQty}
                </Badge>
                <span className="font-bold tabular-nums text-base text-foreground">
                  {cartTotal}
                </span>
              </div>
            </div>
            <div
              className={`transition-all duration-200 ${
                !hasCart ? "opacity-100" : "opacity-0 absolute pointer-events-none"
              }`}
            >
              <p className="text-sm text-muted-foreground">
                From{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {fromPrice}
                </span>
              </p>
            </div>
          </div>

          {/* Action button */}
          {hasCart ? (
            <Button size="lg" onClick={onCheckout} className="shrink-0">
              Checkout
            </Button>
          ) : (
            <Button onClick={onBuyNow} className="shrink-0">
              Get Tickets
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
