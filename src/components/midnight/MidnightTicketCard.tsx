"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/stripe/config";
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
}

export function MidnightTicketCard({
  ticket: tt,
  qty,
  currSymbol,
  onAdd,
  onRemove,
  onViewMerch,
}: MidnightTicketCardProps) {
  const tier = tt.tier || "standard";
  const tierEffect = TIER_EFFECT[tier] || "";
  const isActive = qty > 0;
  const priceDisplay = `${currSymbol}${formatPrice(Number(tt.price))}`;

  const hasMerchImages = tt.includes_merch && (
    (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.front ||
    (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.back
  );

  // Qty pop animation
  const qtyRef = useRef<HTMLSpanElement>(null);
  const prevQty = useRef(qty);
  useEffect(() => {
    if (qty !== prevQty.current && qtyRef.current) {
      qtyRef.current.classList.remove("midnight-qty-pop");
      // Force reflow to restart animation
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
        "relative p-[18px] mb-2 rounded-lg transition-all duration-200",
        !tierEffect && "bg-foreground/[0.03] border border-foreground/[0.08]",
        !tierEffect && "hover:border-foreground/[0.16] hover:bg-foreground/[0.05] hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]",
        !tierEffect && isActive && "border-primary/40 bg-primary/[0.04] shadow-[0_0_16px] shadow-primary/10",
        tierEffect,
        tierEffect && isActive && "midnight-active",
        "max-[480px]:p-3.5",
      )}
      data-ticket-id={tt.id}
    >
      {/* Valentine floating hearts */}
      {tier === "valentine" && <MidnightFloatingHearts />}

      {/* Top row: name + price */}
      <div className="relative z-[2] flex justify-between items-start mb-3 max-[480px]:mb-2.5">
        <div className="flex-1">
          <span
            className={cn(
              "font-[family-name:var(--font-mono)] text-[13px] max-[480px]:text-xs font-bold tracking-[1.5px] max-[480px]:tracking-[1px] uppercase block mb-1",
              TIER_TEXT_CLASSES[tier] || TIER_TEXT_CLASSES.standard,
            )}
          >
            {tt.name}
          </span>
          <span
            className={cn(
              "font-[family-name:var(--font-mono)] text-[11px] max-[480px]:text-[10px] tracking-[0.5px] block",
              TIER_DESC_CLASSES[tier] || TIER_DESC_DEFAULT,
            )}
          >
            {tt.description || "Standard entry"}
          </span>
        </div>
        <span
          className={cn(
            "relative z-[2] font-[family-name:var(--font-mono)] text-[15px] max-[480px]:text-[13px] font-bold tracking-[1px] shrink-0",
            TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
          )}
        >
          {priceDisplay}
        </span>
      </div>

      {/* Bottom row: view merch + qty controls */}
      <div className="relative z-[2] flex justify-between items-center max-[480px]:flex-wrap max-[480px]:gap-2.5">
        {tt.includes_merch ? (
          hasMerchImages ? (
            <Badge
              variant="outline"
              className={cn(
                "cursor-pointer text-[10px] max-[480px]:text-[9px] font-bold tracking-[1.5px] max-[480px]:tracking-[1px] uppercase px-3 max-[480px]:px-2.5 py-2 max-[480px]:py-1.5",
                TIER_MERCH_BADGE_CLASSES[tier] || TIER_MERCH_BADGE_CLASSES.standard,
              )}
              onClick={() => onViewMerch?.(tt)}
            >
              View Merch
            </Badge>
          ) : (
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[1.5px] uppercase text-muted-foreground opacity-60">
              Includes merch
            </span>
          )
        ) : (
          <span />
        )}
        <div className="relative z-[2] flex items-center gap-3.5 max-[480px]:gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "w-10 h-10 max-[480px]:w-9 max-[480px]:h-9 text-base max-[480px]:text-[15px] touch-manipulation",
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
              "font-[family-name:var(--font-mono)] text-lg max-[480px]:text-base font-bold min-w-7 max-[480px]:min-w-6 text-center",
              isActive
                ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-primary"
                : "text-foreground",
            )}
          >
            {qty}
          </span>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "w-10 h-10 max-[480px]:w-9 max-[480px]:h-9 text-base max-[480px]:text-[15px] touch-manipulation",
              TIER_BUTTON_CLASSES[tier],
            )}
            onClick={() => onAdd(tt)}
            aria-label={`Add ${tt.name}`}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  );
}
