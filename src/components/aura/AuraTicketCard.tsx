"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Eye } from "lucide-react";
import type { TicketTypeRow } from "@/types/events";

interface AuraTicketCardProps {
  ticket: TicketTypeRow;
  qty: number;
  currSymbol: string;
  onAdd: () => void;
  onRemove: () => void;
  onViewMerch?: () => void;
}

const TIER_BADGES: Record<string, { variant: "warning" | "default" | "destructive" | "secondary"; label: string }> = {
  platinum: { variant: "warning", label: "VIP" },
  black: { variant: "default", label: "VIP Black" },
  valentine: { variant: "destructive", label: "Special" },
  standard: { variant: "secondary", label: "Standard" },
};

export function AuraTicketCard({
  ticket,
  qty,
  currSymbol,
  onAdd,
  onRemove,
  onViewMerch,
}: AuraTicketCardProps) {
  const cap = ticket.capacity ?? 0;
  const soldOut = cap > 0 && ticket.sold >= cap;
  const sellPct = cap > 0 ? (ticket.sold / cap) * 100 : 0;
  const lowStock = sellPct > 85 && !soldOut;
  const hasMerch = ticket.includes_merch && ticket.product;
  const isSelected = qty > 0;
  const tierKey = ticket.tier || "standard";
  const tierBadge = TIER_BADGES[tierKey] || TIER_BADGES.standard;

  return (
    <Card
      className={cn(
        "transition-all duration-200 aura-card",
        isSelected && "ring-1 ring-primary/40 aura-selected",
        soldOut && "opacity-50 pointer-events-none"
      )}
    >
      <CardContent className="p-4">
        {/* Top: tier badge + name */}
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={tierBadge.variant}>{tierBadge.label}</Badge>
          <h3 className="text-sm font-semibold text-foreground truncate flex-1">
            {ticket.name}
          </h3>
          {soldOut && (
            <Badge variant="destructive" className="text-[10px]">
              Sold Out
            </Badge>
          )}
        </div>

        {/* Description */}
        {ticket.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {ticket.description}
          </p>
        )}

        {/* Bottom row: price + indicators + controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold tabular-nums">
              {currSymbol}
              {ticket.price.toFixed(2)}
            </span>
            {lowStock && (
              <Badge variant="warning" className="text-[10px] aura-pulse">
                Low Stock
              </Badge>
            )}
            {hasMerch && onViewMerch && (
              <button
                onClick={onViewMerch}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
              >
                <Eye size={11} /> Includes merch
              </button>
            )}
          </div>

          {!soldOut && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={onRemove}
                disabled={qty === 0}
                className="rounded-full"
                aria-label={`Remove ${ticket.name}`}
              >
                <Minus size={12} />
              </Button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">
                {qty}
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={onAdd}
                disabled={qty >= (ticket.max_per_order || 10)}
                className="rounded-full"
                aria-label={`Add ${ticket.name}`}
              >
                <Plus size={12} />
              </Button>
            </div>
          )}
        </div>

        {/* Capacity bar */}
        {cap > 0 && !soldOut && (
          <Progress
            value={sellPct}
            className="mt-3 h-1 bg-border/30"
            indicatorClassName={
              lowStock ? "bg-aura-warning/60" : "bg-muted-foreground/25"
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
