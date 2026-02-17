"use client";

import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/stripe/config";

interface CartItem {
  name: string;
  qty: number;
  size?: string;
  unitPrice: number;
}

interface MidnightCartSummaryProps {
  items: CartItem[];
  totalPrice: number;
  totalQty: number;
  currSymbol: string;
}

export function MidnightCartSummary({
  items,
  totalPrice,
  totalQty,
  currSymbol,
}: MidnightCartSummaryProps) {
  const isEmpty = totalQty === 0;

  return (
    <div
      className="mt-5 overflow-hidden transition-all duration-300 ease-out"
      style={{
        maxHeight: isEmpty ? 0 : 400,
        opacity: isEmpty ? 0 : 1,
      }}
    >
      <div className="bg-foreground/[0.015] border border-foreground/[0.05] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.04]">
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/60">
            Your Order
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] uppercase text-muted-foreground/60">
            {totalQty} {totalQty === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Line items */}
        <div className="flex flex-col">
          {items.map((item, i) => (
            <div
              key={i}
              className={`px-4 py-3 ${i > 0 ? "border-t border-foreground/[0.03]" : ""}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary/80 shrink-0 min-w-[22px]">
                  {item.qty}&times;
                </span>
                <span className="font-[family-name:var(--font-display)] text-xs font-medium tracking-[0.01em] text-foreground/80 flex-1">
                  {item.name}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-muted-foreground/60 shrink-0">
                  {currSymbol}{formatPrice(item.unitPrice * item.qty)}
                </span>
              </div>
              {item.size && (
                <div className="flex items-center gap-2 mt-1.5 ml-[30px]">
                  <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.5px] text-muted-foreground/50 uppercase">
                    Size
                  </span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5 font-bold text-primary/80 rounded-md">
                    {item.size}
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer total */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-foreground/[0.05]">
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/50">
            Total
          </span>
          <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground tracking-[0.5px]">
            {currSymbol}{totalPrice.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
