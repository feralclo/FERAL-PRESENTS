"use client";

import React, { useRef, useEffect } from "react";
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

  // Sold-out detection from real inventory
  const capacity = tt.capacity || 0;
  const sold = tt.sold || 0;
  const isSoldOut = capacity > 0 && sold >= capacity;
  const remaining = capacity > 0 ? capacity - sold : Infinity;
  const fillPercent = capacity > 0 ? Math.round((sold / capacity) * 100) : 0;

  const hasMerchImages = tt.includes_merch && (
    (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.front ||
    (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.back
  );

  // Card pulse on add-to-cart
  const cardRef = useRef<HTMLDivElement>(null);
  const PULSE_COLORS: Record<string, string> = {
    platinum: "rgba(229, 228, 226, 0.4)",
    valentine: "rgba(232, 54, 93, 0.4)",
  };

  // Qty pop animation
  const qtyRef = useRef<HTMLSpanElement>(null);
  const prevQty = useRef(qty);
  useEffect(() => {
    if (qty !== prevQty.current) {
      // Qty pop
      if (qtyRef.current) {
        qtyRef.current.classList.remove("midnight-qty-pop");
        void qtyRef.current.offsetWidth;
        qtyRef.current.classList.add("midnight-qty-pop");
      }
      // Card pulse on increase
      if (qty > prevQty.current && cardRef.current) {
        cardRef.current.classList.remove("midnight-card-pulse");
        void cardRef.current.offsetWidth;
        cardRef.current.classList.add("midnight-card-pulse");
      }
      prevQty.current = qty;
    }
  }, [qty]);

  return (
    <div
      ref={cardRef}
      role="article"
      aria-label={`${tt.name} — ${priceDisplay}${isSoldOut ? " — Sold Out" : ""}`}
      className={cn(
        "relative p-5 mb-2.5 rounded-xl transition-all duration-200",
        // Standard tier styling
        !tierEffect && "bg-foreground/[0.025] border border-foreground/[0.06]",
        !tierEffect && "hover:border-foreground/[0.12] hover:bg-foreground/[0.04]",
        !tierEffect && isActive && "border-primary/30 bg-primary/[0.03]",
        // Metallic tier styling
        tierEffect,
        tierEffect && isActive && "midnight-active",
        // Sold out
        isSoldOut && "opacity-50 pointer-events-none",
        // Mobile
        "max-[480px]:p-4",
      )}
      style={PULSE_COLORS[tier] ? { "--pulse-color": PULSE_COLORS[tier] } as React.CSSProperties : undefined}
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
        <span
          className={cn(
            "relative z-[2] font-[family-name:var(--font-mono)] text-base max-[480px]:text-[14px] font-bold tracking-[0.5px] shrink-0 mt-0.5",
            TIER_PRICE_CLASSES[tier] || TIER_PRICE_CLASSES.standard,
          )}
        >
          {isSoldOut ? <s>{priceDisplay}</s> : priceDisplay}
        </span>
      </div>

      {/* Sold-out badge */}
      {isSoldOut && (
        <div className="mb-3">
          <Badge variant="secondary" className="text-[9px] font-bold tracking-[1.5px] uppercase bg-foreground/[0.06] text-muted-foreground">
            Sold Out
          </Badge>
        </div>
      )}

      {/* Scarcity text — only when real inventory data shows >80% sold */}
      {!isSoldOut && fillPercent >= 80 && (
        <p className={cn(
          "font-[family-name:var(--font-mono)] text-[10px] tracking-[0.04em] mb-3",
          fillPercent >= 95 ? "text-destructive midnight-scarcity-pulse" :
          fillPercent >= 90 ? "text-warning" :
          "text-foreground/70",
        )}>
          {remaining <= 5 ? `Last ${remaining}!` : `Only ${remaining} left`}
        </p>
      )}

      {/* Bottom row: view merch + qty controls */}
      <div className="relative z-[2] flex justify-between items-center">
        {tt.includes_merch ? (
          hasMerchImages ? (
            <button
              type="button"
              aria-label={`View merch for ${tt.name}`}
              className={cn(
                "inline-flex items-center text-[10px] max-[480px]:text-[9px] font-bold tracking-[1.5px] max-[480px]:tracking-[1px] uppercase px-3 max-[480px]:px-2.5 py-2 max-[480px]:py-1.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                TIER_MERCH_BADGE_CLASSES[tier] || TIER_MERCH_BADGE_CLASSES.standard,
              )}
              onClick={() => onViewMerch?.(tt)}
            >
              View Merch
            </button>
          ) : (
            <span className="font-[family-name:var(--font-sans)] text-[10px] font-medium tracking-[0.04em] uppercase text-muted-foreground/50">
              Includes merch
            </span>
          )
        ) : (
          <span />
        )}

        {/* Quantity stepper — compact pill */}
        <div className="relative z-[2] flex items-center gap-1 bg-foreground/[0.03] rounded-lg border border-foreground/[0.06] p-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-9 h-9 max-[480px]:w-8 max-[480px]:h-8 text-base max-[480px]:text-[15px] rounded-md touch-manipulation hover:bg-foreground/[0.06]",
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
              "font-[family-name:var(--font-mono)] text-base max-[480px]:text-[15px] font-bold min-w-7 max-[480px]:min-w-6 text-center tabular-nums",
              isActive
                ? TIER_QTY_ACTIVE_CLASSES[tier] || "text-primary"
                : "text-foreground/60",
            )}
          >
            {qty}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-9 h-9 max-[480px]:w-8 max-[480px]:h-8 text-base max-[480px]:text-[15px] rounded-md touch-manipulation hover:bg-foreground/[0.06]",
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
