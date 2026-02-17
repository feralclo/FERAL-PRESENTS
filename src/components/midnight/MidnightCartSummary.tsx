"use client";

import { Badge } from "@/components/ui/badge";

interface CartItem {
  name: string;
  qty: number;
  size?: string;
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
  if (totalQty === 0) return null;

  return (
    <div className="mt-4 bg-foreground/[0.02] border border-foreground/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.04]">
        <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[2px] uppercase text-foreground/70">
          Your Order
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] uppercase text-muted-foreground">
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
              <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary shrink-0 min-w-[22px]">
                {item.qty}&times;
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.5px] text-foreground/90 flex-1">
                {item.name}
              </span>
            </div>
            {item.size && (
              <div className="flex items-center gap-2 mt-1.5 ml-[30px] p-1.5 px-2.5 bg-foreground/[0.03] rounded border border-foreground/[0.04]">
                <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.5px] text-muted-foreground">
                  Size
                </span>
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-bold text-primary">
                  {item.size}
                </Badge>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer total */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-foreground/[0.06] bg-foreground/[0.01]">
        <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold tracking-[2px] uppercase text-foreground/60">
          Total
        </span>
        <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground tracking-[0.5px]">
          {currSymbol}{totalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
