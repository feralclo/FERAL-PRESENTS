"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hasMerchImages } from "@/lib/merch-images";
import { formatPrice } from "@/lib/stripe/config";
import { useCurrencyContext } from "@/components/CurrencyProvider";
import { MidnightFloatingHearts } from "./MidnightFloatingHearts";
import {
  TIER_TEXT_CLASSES,
  TIER_PRICE_CLASSES,
  TIER_DESC_CLASSES,
  TIER_DESC_DEFAULT,
  TIER_QTY_ACTIVE_CLASSES,
  TIER_BUTTON_CLASSES,
  TIER_MERCH_BADGE_CLASSES,
} from "./tier-styles";
import type { TicketTypeRow } from "@/types/events";
import type { DiscountDisplay } from "./discount-utils";
import { getDiscountedPrice } from "./discount-utils";

/** Tier → effects class mapping */
const TIER_EFFECT: Record<string, string> = {
  platinum: "midnight-metallic-platinum",
  black: "midnight-metallic-obsidian",
  valentine: "midnight-metallic-valentine",
};

interface MidnightTicketCardProps {
  ticket: TicketTypeRow;
  qty: number;
  currSymbol: string;
  onAdd: (tt: TicketTypeRow) => void;
  onRemove: (tt: TicketTypeRow) => void;
  onViewMerch?: (tt: TicketTypeRow) => void;
  discount?: DiscountDisplay | null;
}

export function MidnightTicketCard({
  ticket: tt,
  qty,
  currSymbol,
  onAdd,
  onRemove,
  onViewMerch,
  discount,
}: MidnightTicketCardProps) {
  const { convertPrice, formatPrice: fmtPrice } = useCurrencyContext();
  const tier = tt.tier || "standard";
  const tierEffect = TIER_EFFECT[tier] || "";
  const isSoldOut = tt.capacity != null && tt.capacity > 0 && tt.sold >= tt.capacity;
  const isActive = qty > 0;
  const priceDisplay = fmtPrice(convertPrice(Number(tt.price), tt.price_overrides));

  const merchImgs = tt.includes_merch
    ? (tt.product_id && tt.product ? tt.product.images : tt.merch_images)
    : null;
  const hasMerch = hasMerchImages(merchImgs);

  // Qty pop animation
  const qtyRef = useRef<HTMLSpanElement>(null);
  const prevQty = useRef(qty);
  useEffect(() => {
    if (qty !== prevQty.current && qtyRef.current) {
      qtyRef.current.classList.remove("midnight-qty-pop");
      void qtyRef.current.offsetWidth;
      qtyRef.current.classList.add("midnight-qty-pop");
      prevQty.current = qty;
    }
  }, [qty]);

  return (
    <div
      role="article"
      aria-label={`${tt.name} — ${priceDisplay}`}
      className={cn(
        "relative p-5 mb-2.5 rounded-xl transition-all duration-200",
        // Sold out
        isSoldOut && "opacity-40 pointer-events-none",
        // Standard tier styling
        !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
        !tierEffect && !isSoldOut && "hover:border-foreground/[0.12] hover:bg-foreground/[0.04]",
        !tierEffect && isActive && !isSoldOut && "border-foreground/[0.15] bg-foreground/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_16px_rgba(255,255,255,0.02)]",
        // Metallic tier styling
        tierEffect,
        tierEffect && isActive && !isSoldOut && "midnight-active",
        // Mobile
        "max-[480px]:p-4",
      )}
      data-ticket-id={tt.id}
    >
      {/* Valentine floating hearts */}
      {tier === "valentine" && <MidnightFloatingHearts />}

      {/* Top row: name + price */}
      <div className="relative z-[2] flex justify-between items-start mb-3.5 max-[480px]:mb-3">
        <div className="flex-1 min-w-0 mr-4">
          <span
            className={cn(
              "font-[family-name:var(--font-sans)] text-sm max-[480px]:text-[13px] font-semibold tracking-[0.04em] uppercase block mb-1.5",
              TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
            )}
          >
            {tt.name}
          </span>
          <span
            className={cn(
              "font-[family-name:var(--font-display)] text-[12px] max-[480px]:text-[11px] tracking-[0.01em] block leading-relaxed",
              TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
            )}
          >
            {tt.description || "Standard entry"}
          </span>
        </div>
        {discount && discount.type === "percentage" ? (
          <div className="relative z-[2] flex flex-col items-end shrink-0 mt-0.5">
            <span className="font-[family-name:var(--font-mono)] text-[11px] max-[480px]:text-[10px] font-medium tracking-[0.3px] text-foreground/25 line-through">
              {priceDisplay}
            </span>
            <span
              className={cn(
                "font-[family-name:var(--font-mono)] text-base max-[480px]:text-[14px] font-bold tracking-[0.5px]",
                TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
              )}
            >
              {fmtPrice(getDiscountedPrice(convertPrice(Number(tt.price), tt.price_overrides), discount))}
            </span>
          </div>
        ) : (
          <span
            className={cn(
              "relative z-[2] font-[family-name:var(--font-mono)] text-base max-[480px]:text-[14px] font-bold tracking-[0.5px] shrink-0 mt-0.5",
              TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
            )}
          >
            {priceDisplay}
          </span>
        )}
      </div>

      {/* Bottom row: view merch + qty controls */}
      <div className="relative z-[2] flex justify-between items-center">
        {tt.includes_merch ? (
          hasMerch ? (
            <Badge
              variant="outline"
              className={cn(
                "cursor-pointer text-[10px] max-[480px]:text-[9px] font-bold tracking-[1.5px] max-[480px]:tracking-[1px] uppercase px-3 max-[480px]:px-2.5 py-2 max-[480px]:py-1.5 rounded-lg",
                TIER_MERCH_BADGE_CLASSES[tier] || TIER_MERCH_BADGE_CLASSES.standard,
              )}
              onClick={() => onViewMerch?.(tt)}
            >
              View Merch
            </Badge>
          ) : (
            <span className="font-[family-name:var(--font-sans)] text-[10px] font-medium tracking-[0.04em] uppercase text-muted-foreground/50">
              Includes merch
            </span>
          )
        ) : (
          <span />
        )}

        {/* Quantity stepper — 44px min touch target (Apple HIG) */}
        {isSoldOut ? (
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/30">
            Sold out
          </span>
        ) : (
          <div className="relative z-[2] flex items-center gap-1 bg-foreground/[0.03] rounded-xl border border-foreground/[0.06] p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-11 h-11 max-[480px]:w-10 max-[480px]:h-10 text-lg max-[480px]:text-base rounded-lg touch-manipulation hover:bg-foreground/[0.06] active:scale-[0.92] transition-transform duration-100",
                TIER_BUTTON_CLASSES[tier],
              )}
              onClick={() => onRemove(tt)}
              aria-label={`Remove ${tt.name}`}
            >
              &minus;
            </Button>
            <span
              ref={qtyRef}
              className={cn(
                "font-[family-name:var(--font-mono)] text-base max-[480px]:text-[15px] font-bold min-w-8 max-[480px]:min-w-7 text-center tabular-nums",
                isActive
                  ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground"
                  : "text-foreground/60",
              )}
            >
              {qty}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-11 h-11 max-[480px]:w-10 max-[480px]:h-10 text-lg max-[480px]:text-base rounded-lg touch-manipulation hover:bg-foreground/[0.06] active:scale-[0.92] transition-transform duration-100",
                TIER_BUTTON_CLASSES[tier],
              )}
              onClick={() => tt.includes_merch && onViewMerch ? onViewMerch(tt) : onAdd(tt)}
              aria-label={`Add ${tt.name}`}
            >
              +
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
