"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Eye, Sparkles } from "lucide-react";
import type { TicketTypeRow } from "@/types/events";

interface AuraTicketCardProps {
  ticket: TicketTypeRow;
  qty: number;
  currSymbol: string;
  onAdd: () => void;
  onRemove: () => void;
  onViewMerch?: () => void;
}

const TIER_STYLES: Record<string, { border: string; badge: string; label: string }> = {
  platinum: {
    border: "border-[#c0b283]/40",
    badge: "bg-[#c0b283]/15 text-[#c0b283] border-[#c0b283]/25",
    label: "Platinum",
  },
  black: {
    border: "border-foreground/20",
    badge: "bg-foreground/10 text-foreground border-foreground/20",
    label: "Black",
  },
  valentine: {
    border: "border-[#e8365d]/30",
    badge: "bg-[#e8365d]/15 text-[#e8365d] border-[#e8365d]/25",
    label: "Special",
  },
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
  const tier = TIER_STYLES[ticket.tier || ""];
  const hasMerch = ticket.includes_merch && ticket.product;
  const isSelected = qty > 0;

  return (
    <Card
      className={`group relative overflow-hidden transition-all duration-300 py-0 gap-0 ${
        isSelected
          ? "aura-gradient-border aura-glow-accent border-transparent"
          : tier
            ? tier.border
            : "border-border/40 hover:border-border/70"
      } ${isSelected ? "aura-cart-flash" : ""} aura-hover-lift`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Name + badges */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold tracking-tight">
                {ticket.name}
              </h3>
              {tier && (
                <Badge className={`text-[10px] ${tier.badge}`}>
                  <Sparkles size={10} />
                  {tier.label}
                </Badge>
              )}
              {lowStock && (
                <Badge className="aura-pulse bg-aura-warning/15 text-aura-warning border-aura-warning/25 text-[10px]">
                  Low Stock
                </Badge>
              )}
              {soldOut && (
                <Badge variant="secondary" className="text-[10px]">
                  Sold Out
                </Badge>
              )}
            </div>

            {/* Description */}
            {ticket.description && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {ticket.description}
              </p>
            )}

            {/* Capacity bar */}
            {cap > 0 && !soldOut && (
              <div className="pt-1">
                <Progress
                  value={sellPct}
                  className="h-1 bg-card"
                  indicatorClassName="aura-capacity-bar"
                />
              </div>
            )}

            {/* Merch link */}
            {hasMerch && onViewMerch && (
              <button
                onClick={onViewMerch}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-0.5"
              >
                <Eye size={12} />
                View Merch
              </button>
            )}
          </div>

          {/* Right: price + counter */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Price */}
            <div className="text-right">
              <span className="font-display text-xl font-bold tabular-nums">
                {currSymbol}
                {ticket.price.toFixed(2)}
              </span>
            </div>

            {/* Counter */}
            {!soldOut && (
              <div className="flex items-center gap-1">
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
                <span className="w-8 text-center text-sm font-semibold tabular-nums">
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
        </div>
      </CardContent>
    </Card>
  );
}
