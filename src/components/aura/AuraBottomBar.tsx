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
      <div className="border-t border-border bg-card px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {hasCart ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 text-xs">
                  <ShoppingCart size={12} />
                  {cartQty}
                </Badge>
                <span className="font-display font-bold tabular-nums text-sm">
                  {cartTotal}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                From{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {fromPrice}
                </span>
              </p>
            )}
          </div>

          {hasCart ? (
            <Button
              onClick={onCheckout}
              className="aura-glow aura-press rounded-lg px-6 shrink-0 font-semibold"
            >
              Checkout
            </Button>
          ) : (
            <Button
              onClick={onBuyNow}
              className="aura-glow aura-press rounded-lg px-6 shrink-0 font-semibold"
            >
              Get Tickets
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
