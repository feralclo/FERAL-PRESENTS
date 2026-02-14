"use client";

import { AuroraButton } from "./ui/button";

interface AuroraBottomBarProps {
  fromPrice: string;
  cartTotal?: string;
  cartQty: number;
  onBuyNow: () => void;
  onCheckout?: () => void;
}

export function AuroraBottomBar({
  fromPrice,
  cartTotal,
  cartQty,
  onBuyNow,
  onCheckout,
}: AuroraBottomBarProps) {
  const hasCart = cartQty > 0 && !!cartTotal;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 aurora-glass-strong border-t border-aurora-border/50 md:hidden">
      <div className="flex items-center justify-between px-4 py-3 max-w-5xl mx-auto">
        <div className="flex flex-col">
          {hasCart ? (
            <>
              <span className="text-lg font-bold text-aurora-text">
                {cartTotal}
              </span>
              <span className="text-xs text-aurora-text-secondary">
                {cartQty} {cartQty === 1 ? "ticket" : "tickets"}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-aurora-text-secondary">From</span>
              <span className="text-lg font-bold text-aurora-text">
                {fromPrice}
              </span>
            </>
          )}
        </div>
        <AuroraButton
          variant="primary"
          size="lg"
          glow={hasCart}
          onClick={hasCart ? onCheckout : onBuyNow}
        >
          {hasCart ? "Checkout" : "Get Tickets"}
        </AuroraButton>
      </div>
    </div>
  );
}
