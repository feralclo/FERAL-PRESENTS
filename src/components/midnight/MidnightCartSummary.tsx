"use client";

import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/stripe/config";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import type { DiscountDisplay } from "./discount-utils";
import { getDiscountAmount } from "./discount-utils";

interface CartItem {
  name: string;
  qty: number;
  size?: string;
  unitPrice: number;
  price_overrides?: Record<string, number> | null;
}

interface MidnightCartSummaryProps {
  items: CartItem[];
  totalPrice: number;
  totalQty: number;
  currSymbol: string;
  discount?: DiscountDisplay | null;
}

export function MidnightCartSummary({
  items,
  totalPrice,
  totalQty,
  currSymbol,
  discount,
}: MidnightCartSummaryProps) {
  const { convertPrice, formatPrice: fmtPrice } = useCurrencyContext();
  const isEmpty = totalQty === 0;

  // Calculate converted total from individual items (respects per-item overrides)
  const convertedTotal = items.reduce(
    (sum, item) => sum + convertPrice(item.unitPrice, item.price_overrides) * item.qty,
    0
  );
  const discountAmt = discount ? getDiscountAmount(convertedTotal, discount) : 0;
  const discountedTotal = discount
    ? Math.max(0, Math.round((convertedTotal - discountAmt) * 100) / 100)
    : convertedTotal;

  return (
    <div
      className="mt-5 overflow-hidden transition-all duration-300 ease-out"
      style={{
        maxHeight: isEmpty ? 0 : 500,
        opacity: isEmpty ? 0 : 1,
      }}
    >
      <div className="bg-foreground/[0.025] border border-foreground/[0.08] rounded-xl overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.06]">
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-sans)] text-[11px] font-bold tracking-[0.12em] uppercase text-foreground/60">
              Your Order
            </span>
            {discount && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-[family-name:var(--font-mono)] font-bold tracking-[0.08em] uppercase text-emerald-400/70 bg-emerald-400/[0.06] border border-emerald-400/[0.10]">
                Discount applied
              </span>
            )}
          </div>
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] uppercase text-foreground/35">
            {totalQty} {totalQty === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Line items */}
        <div className="flex flex-col">
          {items.map((item, i) => (
            <div
              key={i}
              className={`px-4 py-3 ${i > 0 ? "border-t border-foreground/[0.04]" : ""}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-foreground/50 shrink-0 min-w-[22px]">
                  {item.qty}&times;
                </span>
                <span className="font-[family-name:var(--font-display)] text-xs font-medium tracking-[0.01em] text-foreground/80 flex-1">
                  {item.name}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] font-medium text-foreground/50 shrink-0">
                  {fmtPrice(convertPrice(item.unitPrice, item.price_overrides) * item.qty)}
                </span>
              </div>
              {item.size && (
                <div className="flex items-center gap-2 mt-1.5 ml-[30px]">
                  <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.5px] text-foreground/30 uppercase">
                    Size
                  </span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5 font-bold text-foreground/70 bg-foreground/[0.06] rounded-md">
                    {item.size}
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Discount line */}
        {discount && discountAmt > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-foreground/[0.04]">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-[family-name:var(--font-mono)] font-bold tracking-[0.06em] uppercase text-foreground/40 bg-foreground/[0.04] border border-foreground/[0.06]">
                {discount.code}
              </span>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[11px] font-medium text-emerald-400/60 shrink-0">
              &minus;{fmtPrice(discountAmt)}
            </span>
          </div>
        )}

        {/* Footer total */}
        <div className="flex items-center justify-between px-4 py-3.5 border-t border-foreground/[0.08] bg-foreground/[0.015]">
          <span className="font-[family-name:var(--font-sans)] text-[11px] font-bold tracking-[0.12em] uppercase text-foreground/60">
            Total
          </span>
          <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground tracking-[0.5px]">
            {fmtPrice(discountedTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
