"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/stripe/config";
import type { TicketTypeRow } from "@/types/events";

interface MidnightTierProgressionProps {
  tickets: TicketTypeRow[];
  currSymbol: string;
}

export function MidnightTierProgression({
  tickets,
  currSymbol,
}: MidnightTierProgressionProps) {
  if (tickets.length <= 1) return null;

  const firstActiveIdx = tickets.findIndex(
    (tt) => tt.status === "active" && (tt.sold || 0) < (tt.capacity || Infinity)
  );

  return (
    <div className="flex gap-1.5 max-[480px]:gap-1 mb-5 max-[480px]:mb-4 pb-5 max-[480px]:pb-4 border-b border-foreground/[0.05]">
      {tickets.map((tt, i) => {
        const soldOut = (tt.sold || 0) >= (tt.capacity || Infinity);
        const isActive = i === firstActiveIdx;
        const isNext = i > firstActiveIdx && !soldOut;

        return (
          <div
            key={tt.id}
            className={cn(
              "flex-1 p-2.5 max-[480px]:p-2 text-center rounded-lg transition-all duration-200 min-w-0",
              soldOut && "opacity-40 bg-foreground/[0.01]",
              isActive && "bg-primary/[0.05] border border-primary/25",
              isNext && "border border-dashed border-foreground/[0.05] opacity-45",
              !soldOut && !isActive && !isNext && "bg-foreground/[0.015] border border-foreground/[0.05]",
            )}
          >
            <span className="font-[family-name:var(--font-mono)] text-[9px] max-[480px]:text-[8px] font-bold tracking-[0.5px] max-[480px]:tracking-[0.3px] uppercase block mb-1 truncate text-muted-foreground">
              {isActive && <span className="text-foreground/90">{tt.name}</span>}
              {!isActive && tt.name}
            </span>
            <span
              className={cn(
                "font-[family-name:var(--font-mono)] text-xs max-[480px]:text-[11px] font-bold block mb-1",
                soldOut ? "line-through text-muted-foreground" : "text-foreground",
              )}
            >
              {currSymbol}{formatPrice(Number(tt.price))}
            </span>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={cn(
                "text-[8px] max-[480px]:text-[7px] font-bold tracking-[1.5px] max-[480px]:tracking-[1px] uppercase px-1.5 py-0",
                soldOut && "bg-transparent text-muted-foreground",
                isActive && "bg-primary/15 text-primary border-none",
                isNext && "bg-transparent text-muted-foreground",
              )}
            >
              {soldOut ? "Sold Out" : isActive ? "On Sale" : "Upcoming"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
