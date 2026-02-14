"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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

const TIER_BADGES: Record<
  string,
  {
    variant: "default" | "secondary" | "outline" | "destructive";
    label: string;
  }
> = {
  platinum: { variant: "default", label: "VIP" },
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
        "relative py-0 gap-0 transition-all duration-200",
        "hover:border-primary/40",
        isSelected && "ring-2 ring-primary bg-primary/[0.03]",
        soldOut && "opacity-60 pointer-events-none"
      )}
      role="article"
      aria-label={`${ticket.name} ticket — ${currSymbol}${ticket.price.toFixed(2)}${soldOut ? " — Sold out" : ""}`}
    >
      {/* Sold out overlay badge */}
      {soldOut && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl">
          <Badge variant="destructive" className="text-sm px-4 py-1">
            Sold Out
          </Badge>
        </div>
      )}

      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-sm truncate">
          {ticket.name}
        </CardTitle>
        <CardAction>
          <Badge variant={tierBadge.variant}>{tierBadge.label}</Badge>
        </CardAction>
        {ticket.description && (
          <CardDescription className="line-clamp-2 text-xs">
            {ticket.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="px-4 pt-3 pb-4 space-y-3">
        {/* Price — most prominent element */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tabular-nums" aria-label={`Price: ${currSymbol}${ticket.price.toFixed(2)}`}>
            {currSymbol}
            {ticket.price.toFixed(2)}
          </span>
          {hasMerch && onViewMerch && (
            <Badge
              variant="default"
              className="gap-1 cursor-pointer"
              onClick={onViewMerch}
            >
              <Eye size={11} />
              Includes merch
            </Badge>
          )}
        </div>

        {/* Quantity controls */}
        {!soldOut && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={onRemove}
              disabled={qty === 0}
              className="h-8 w-8"
              aria-label={`Remove one ${ticket.name} ticket`}
            >
              <Minus size={14} />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {qty}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={onAdd}
              disabled={qty >= (ticket.max_per_order || 10)}
              className="h-8 w-8"
              aria-label={`Add one ${ticket.name} ticket`}
            >
              <Plus size={14} />
            </Button>
          </div>
        )}

        {/* Capacity bar */}
        {cap > 0 && !soldOut && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Progress
                value={sellPct}
                className={cn(lowStock ? "h-2" : "h-1.5")}
                indicatorClassName={
                  lowStock ? "bg-destructive" : "bg-muted-foreground/25"
                }
                aria-label={`${Math.round(sellPct)}% sold`}
              />
              {sellPct > 50 && (
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                  {Math.round(sellPct)}% sold
                </span>
              )}
            </div>
            {lowStock && (
              <Badge variant="destructive" className="text-[10px]">
                Almost gone
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
