"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hasMerchImages } from "@/lib/merch-images";
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

/** Tier → effects class mapping (metallic gradient backgrounds) */
const TIER_EFFECT: Record<string, string> = {
  platinum: "midnight-metallic-platinum",
  black: "midnight-metallic-obsidian",
  valentine: "midnight-metallic-valentine",
};

/** Tier → ambient glow colour for active state. Restrained, not flashy. */
const TIER_GLOW: Record<string, string> = {
  platinum: "rgba(220,220,235,0.22)",
  valentine: "rgba(255,126,179,0.22)",
  black: "rgba(255,255,255,0.18)",
  standard: "rgba(255,255,255,0.10)",
};
const TIER_GLOW_FAINT: Record<string, string> = {
  platinum: "rgba(220,220,235,0.06)",
  valentine: "rgba(255,126,179,0.06)",
  black: "rgba(255,255,255,0.05)",
  standard: "rgba(255,255,255,0.03)",
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
  const isSoldOut = tt.status === "sold_out" || (tt.capacity != null && tt.capacity > 0 && tt.sold >= tt.capacity);
  const isActive = qty > 0;
  const priceDisplay = fmtPrice(convertPrice(Number(tt.price), tt.price_overrides));
  const glow = TIER_GLOW[tier] || TIER_GLOW.standard;
  const glowFaint = TIER_GLOW_FAINT[tier] || TIER_GLOW_FAINT.standard;

  const merchImgs = tt.includes_merch
    ? (tt.product_id && tt.product ? tt.product.images : tt.merch_images)
    : null;
  const hasMerch = hasMerchImages(merchImgs);

  // Qty pop animation — fires whenever qty changes (incl. 0 → 1 reveal)
  const qtyRef = useRef<HTMLSpanElement>(null);
  const prevQty = useRef(qty);
  useEffect(() => {
    if (qty !== prevQty.current && qtyRef.current) {
      qtyRef.current.classList.remove("midnight-qty-pop");
      void qtyRef.current.offsetWidth;
      qtyRef.current.classList.add("midnight-qty-pop");
    }
    prevQty.current = qty;
  }, [qty]);

  // Tap "+" on a merch ticket from empty state → open size sheet, not direct add
  const handleAdd = () =>
    tt.includes_merch && onViewMerch ? onViewMerch(tt) : onAdd(tt);

  return (
    <div
      role="article"
      aria-label={`${tt.name} — ${priceDisplay}`}
      className={cn(
        "relative px-4 py-3.5 mb-2 rounded-xl transition-all duration-300",
        "max-[480px]:px-3.5 max-[480px]:py-3",
        // Sold out
        isSoldOut && "opacity-40 pointer-events-none",
        // Standard tier — V1 box: bg + border, intensifies on active
        !tierEffect && "bg-foreground/[0.025] border",
        !tierEffect && (isActive && !isSoldOut
          ? "border-foreground/[0.20]"
          : "border-foreground/[0.06]"),
        !tierEffect && !isActive && !isSoldOut && "hover:border-foreground/[0.12] hover:bg-foreground/[0.035]",
        // Metallic tier styling (platinum / black / valentine) — keeps gradient bg
        tierEffect,
        tierEffect && isActive && !isSoldOut && "midnight-active",
      )}
      style={
        // Glow ambient lighting when active. Skipped on metallic tiers — they
        // already have their own gradient/effect that we don't want to fight.
        isActive && !isSoldOut && !tierEffect
          ? {
              boxShadow: `0 0 28px ${glow}, 0 0 0 1px ${glow}`,
              backgroundImage: `radial-gradient(140% 100% at 100% 50%, ${glowFaint}, transparent 60%)`,
            }
          : undefined
      }
      data-ticket-id={tt.id}
    >
      {/* Valentine floating hearts */}
      {tier === "valentine" && <MidnightFloatingHearts />}

      <div className="relative z-[2] flex items-center gap-3 max-[480px]:gap-2.5">
        {/* Left: name + description (+ optional merch chip) */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "font-[family-name:var(--font-sans)] text-[13px] max-[480px]:text-[12px] font-bold tracking-[0.05em] uppercase block leading-tight",
              TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
            )}
          >
            {tt.name}
          </span>
          {tt.description ? (
            <span
              className={cn(
                "font-[family-name:var(--font-display)] text-[11px] tracking-[0.01em] block leading-snug mt-1 truncate",
                TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
              )}
            >
              {tt.description}
            </span>
          ) : null}

          {tt.includes_merch ? (
            hasMerch ? (
              <Badge
                variant="outline"
                className={cn(
                  "mt-2 cursor-pointer text-[10px] max-[480px]:text-[9px] font-bold tracking-[1.5px] max-[480px]:tracking-[1px] uppercase px-2.5 py-1 rounded-md",
                  TIER_MERCH_BADGE_CLASSES[tier] || TIER_MERCH_BADGE_CLASSES.standard,
                )}
                onClick={() => onViewMerch?.(tt)}
              >
                View Merch
              </Badge>
            ) : (
              <span className="mt-2 inline-block font-[family-name:var(--font-sans)] text-[10px] font-medium tracking-[0.04em] uppercase text-muted-foreground/50">
                Includes merch
              </span>
            )
          ) : null}
        </div>

        {/* Right: price + smart add/stepper */}
        <div className="shrink-0 flex items-center gap-3 max-[480px]:gap-2">
          {/* Price — single or stacked-discount */}
          {discount && discount.type === "percentage" ? (
            <div className="flex flex-col items-end leading-none">
              <span className="font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] font-medium tracking-[0.3px] text-foreground/25 line-through mb-1">
                {priceDisplay}
              </span>
              <span
                className={cn(
                  "font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] tabular-nums",
                  TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
                )}
              >
                {fmtPrice(getDiscountedPrice(convertPrice(Number(tt.price), tt.price_overrides), discount))}
              </span>
            </div>
          ) : (
            <span
              className={cn(
                "font-[family-name:var(--font-mono)] text-base font-bold tracking-[0.5px] tabular-nums",
                TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
              )}
            >
              {priceDisplay}
            </span>
          )}

          {/* Sold out · OR · single + button (qty=0) · OR · ghost stepper (qty>0) */}
          {isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.2em] uppercase text-foreground/30">
              Sold out
            </span>
          ) : qty === 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-9 h-9 max-[480px]:w-8 max-[480px]:h-8 rounded-full touch-manipulation",
                "bg-foreground/[0.04] hover:bg-foreground/[0.10] active:scale-90 transition-transform duration-100",
                "text-foreground/80",
                TIER_BUTTON_CLASSES[tier],
              )}
              onClick={handleAdd}
              aria-label={`Add ${tt.name}`}
            >
              <span className="text-base leading-none">+</span>
            </Button>
          ) : (
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "w-9 h-9 max-[480px]:w-8 max-[480px]:h-8 rounded-full touch-manipulation",
                  "hover:bg-foreground/[0.08] active:scale-90 transition-transform duration-100",
                  "text-foreground/70",
                  TIER_BUTTON_CLASSES[tier],
                )}
                onClick={() => onRemove(tt)}
                aria-label={`Remove ${tt.name}`}
              >
                <span className="text-base leading-none">&minus;</span>
              </Button>
              <span
                ref={qtyRef}
                className={cn(
                  "font-[family-name:var(--font-mono)] text-sm font-bold min-w-5 text-center tabular-nums select-none",
                  TIER_QTY_ACTIVE_CLASSES[tier] || "text-foreground",
                )}
              >
                {qty}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "w-9 h-9 max-[480px]:w-8 max-[480px]:h-8 rounded-full touch-manipulation",
                  "hover:bg-foreground/[0.08] active:scale-90 transition-transform duration-100",
                  "text-foreground",
                  TIER_BUTTON_CLASSES[tier],
                )}
                onClick={handleAdd}
                aria-label={`Add ${tt.name}`}
              >
                <span className="text-base leading-none">+</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
