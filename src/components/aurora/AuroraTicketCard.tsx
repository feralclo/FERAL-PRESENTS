"use client";

import { AuroraCard } from "./ui/card";
import { AuroraBadge } from "./ui/badge";
import { AuroraCounter } from "./ui/counter";
import { AuroraProgress } from "./ui/progress";
import type { TicketTypeRow } from "@/types/events";

interface AuroraTicketCardProps {
  ticket: TicketTypeRow;
  qty: number;
  currSymbol: string;
  onAdd: () => void;
  onRemove: () => void;
  onViewMerch?: () => void;
}

export function AuroraTicketCard({
  ticket,
  qty,
  currSymbol,
  onAdd,
  onRemove,
  onViewMerch,
}: AuroraTicketCardProps) {
  const price = Number(ticket.price);
  const priceDisplay = price % 1 === 0 ? price.toString() : price.toFixed(2);
  const capacity = ticket.capacity || 0;
  const sold = ticket.sold || 0;
  const sellThrough = capacity > 0 ? (sold / capacity) * 100 : 0;
  const isLowStock = capacity > 0 && sellThrough > 85;
  const isSoldOut = ticket.status === "sold_out";
  const hasMerchImages = ticket.includes_merch &&
    ((ticket.product_id && ticket.product ? ticket.product.images : ticket.merch_images)?.front ||
     (ticket.product_id && ticket.product ? ticket.product.images : ticket.merch_images)?.back);

  // Tier styling
  const isVip = ticket.tier === "platinum" || ticket.tier === "black";

  return (
    <AuroraCard
      glass
      gradientBorder={isVip || qty > 0}
      glow={qty > 0}
      className={`p-4 transition-all duration-300 ${qty > 0 ? "aurora-cart-flash" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-base font-semibold text-aurora-text truncate">
              {ticket.name}
            </h3>
            {isVip && (
              <AuroraBadge variant="vip">VIP</AuroraBadge>
            )}
            {isLowStock && !isSoldOut && (
              <AuroraBadge variant="low-stock" pulse>
                Low Stock
              </AuroraBadge>
            )}
            {isSoldOut && (
              <AuroraBadge variant="sold-out">Sold Out</AuroraBadge>
            )}
          </div>

          {/* Description */}
          {ticket.description && (
            <p className="text-sm text-aurora-text-secondary mb-2">
              {ticket.description}
            </p>
          )}

          {/* Capacity bar */}
          {capacity > 0 && !isSoldOut && (
            <div className="mb-2">
              <AuroraProgress value={sellThrough} />
            </div>
          )}

          {/* Merch link */}
          {hasMerchImages && (
            <button
              type="button"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
              onClick={onViewMerch}
            >
              View Merch &rarr;
            </button>
          )}
        </div>

        {/* Price + Counter */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xl font-bold text-aurora-text">
            {currSymbol}{priceDisplay}
          </span>
          {!isSoldOut && (
            <AuroraCounter
              value={qty}
              min={0}
              max={ticket.max_per_order}
              onChange={(newVal) => {
                if (newVal > qty) onAdd();
                else onRemove();
              }}
            />
          )}
        </div>
      </div>
    </AuroraCard>
  );
}
