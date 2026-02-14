"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
        "py-0 gap-0 transition-all duration-200",
        isSelected && "ring-2 ring-primary",
        soldOut && "opacity-50 pointer-events-none"
      )}
    >
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex items-center gap-2">
          <Badge variant={tierBadge.variant}>{tierBadge.label}</Badge>
          <CardTitle className="text-sm truncate flex-1">
            {ticket.name}
          </CardTitle>
          {soldOut && (
            <Badge variant="destructive" className="text-[10px]">
              Sold Out
            </Badge>
          )}
        </div>
        {ticket.description && (
          <CardDescription className="line-clamp-2 text-xs">
            {ticket.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="px-4 pt-3 pb-4">
        {/* Price row + quantity controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tabular-nums">
              {currSymbol}
              {ticket.price.toFixed(2)}
            </span>
            {lowStock && (
              <Badge variant="destructive" className="text-[10px]">
                Low Stock
              </Badge>
            )}
            {hasMerch && onViewMerch && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewMerch}
                className="gap-1 text-[11px] px-2 h-7"
              >
                <Eye size={11} />
                Includes merch
              </Button>
            )}
          </div>

          {!soldOut && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                onClick={onRemove}
                disabled={qty === 0}
                className="h-7 w-7"
                aria-label={`Remove ${ticket.name}`}
              >
                <Minus size={14} />
              </Button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">
                {qty}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={onAdd}
                disabled={qty >= (ticket.max_per_order || 10)}
                className="h-7 w-7"
                aria-label={`Add ${ticket.name}`}
              >
                <Plus size={14} />
              </Button>
            </div>
          )}
        </div>

        {/* Capacity bar */}
        {cap > 0 && !soldOut && (
          <>
            <Separator className="my-3 opacity-30" />
            <Progress
              value={sellPct}
              className="h-1"
              indicatorClassName={
                lowStock ? "bg-destructive" : "bg-muted-foreground/25"
              }
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
