"use client";

import { Button } from "@/components/ui/button";
import { ShoppingCart, ChevronRight } from "lucide-react";

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
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="border-t border-border/40 bg-[var(--color-aura-bg)]/95 backdrop-blur-md px-4 py-3 safe-area-pb">
        <div className="flex items-center justify-between gap-3">
          {/* Price info */}
          <div className="min-w-0">
            {hasCart ? (
              <div>
                <span className="font-display text-lg font-bold tabular-nums">{cartTotal}</span>
                <p className="text-[11px] text-muted-foreground">{cartQty} {cartQty === 1 ? "ticket" : "tickets"}</p>
              </div>
            ) : (
              <div>
                <span className="text-xs text-muted-foreground">From</span>
                <span className="ml-1.5 font-display text-lg font-bold tabular-nums">{fromPrice}</span>
              </div>
            )}
          </div>

          {/* Action */}
          {hasCart ? (
            <Button
              onClick={onCheckout}
              className="aura-glow-accent aura-press rounded-full px-6 font-semibold shrink-0"
            >
              <ShoppingCart size={14} />
              Checkout
              <ChevronRight size={14} />
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onBuyNow}
              className="aura-press rounded-full px-6 font-semibold shrink-0"
            >
              Get Tickets
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
