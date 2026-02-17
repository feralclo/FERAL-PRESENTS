"use client";

import { Button } from "@/components/ui/button";

interface MidnightBottomBarProps {
  fromPrice?: string;
  cartTotal?: string;
  cartQty?: number;
  cartItems?: { name: string; qty: number; size?: string }[];
  onBuyNow: () => void;
  onCheckout?: () => void;
}

export function MidnightBottomBar({
  fromPrice = "\u00a326.46",
  cartTotal,
  cartQty = 0,
  cartItems,
  onBuyNow,
  onCheckout,
}: MidnightBottomBarProps) {
  const hasCart = cartQty > 0 && cartTotal;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[997] lg:hidden glass border-t border-foreground/[0.08] px-6 max-[480px]:px-4 py-3 max-[480px]:py-2.5 pb-[calc(12px+env(safe-area-inset-bottom))] max-[480px]:pb-[calc(10px+env(safe-area-inset-bottom))] transform-gpu will-change-transform [backface-visibility:hidden]">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-3 max-[480px]:gap-2.5">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-[family-name:var(--font-display)] text-lg max-[480px]:text-[1.05rem] font-bold text-foreground tracking-[-0.01em]">
            {hasCart ? cartTotal : `From ${fromPrice}`}
          </span>
          {hasCart && cartItems && cartItems.length > 0 ? (
            <div className="flex flex-col gap-px">
              {cartItems.map((item, i) => (
                <span key={i} className="text-[0.65rem] text-muted-foreground leading-tight truncate">
                  {item.qty}&times; {item.name}
                  {item.size && (
                    <span className="text-primary ml-1 font-semibold">
                      Size: {item.size}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-[family-name:var(--font-display)] text-[11px] max-[480px]:text-[10px] text-muted-foreground">
              Incl. booking fee. No surprises.
            </span>
          )}
        </div>
        {hasCart && (
          <span className="text-primary text-[0.7rem] font-[family-name:var(--font-mono)] whitespace-nowrap tracking-[0.5px] shrink-0">
            {cartQty} ticket{cartQty !== 1 ? "s" : ""}
          </span>
        )}
        <Button
          className="px-8 max-[480px]:px-5 py-3 max-[480px]:py-2.5 font-[family-name:var(--font-mono)] text-xs max-[480px]:text-[11px] font-bold tracking-[2px] max-[480px]:tracking-[1.5px] uppercase whitespace-nowrap touch-manipulation shrink-0"
          onClick={hasCart && onCheckout ? onCheckout : onBuyNow}
        >
          {hasCart ? "Checkout" : "Buy Now"}
        </Button>
      </div>
    </div>
  );
}
