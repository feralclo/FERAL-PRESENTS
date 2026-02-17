"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MidnightFloatingHearts } from "./MidnightFloatingHearts";
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

  const priceDisplay =
    Number(tt.price) % 1 === 0
      ? Number(tt.price)
      : Number(tt.price).toFixed(2);

  const hasMerchImages = tt.includes_merch && (
    (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.front ||
    (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.back
  );

  return (
    <div
      role="article"
      aria-label={`${tt.name} — ${currSymbol}${priceDisplay}`}
      className={cn(
        "relative p-[18px] mb-2 rounded-lg transition-all duration-200",
        // Standard tier base styles
        !tierEffect && "bg-foreground/[0.03] border border-foreground/[0.08]",
        !tierEffect && "hover:border-foreground/[0.16] hover:bg-foreground/[0.05] hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]",
        // Active state for standard tier
        !tierEffect && isActive && "border-primary/40 bg-primary/[0.04] shadow-[0_0_16px] shadow-primary/10",
        // Tier effect class from midnight-effects.css
        tierEffect,
        // Active modifier for tier effects
        tierEffect && isActive && "midnight-active",
        // Small phone
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
              tier === "platinum" && "text-platinum",
              tier === "valentine" && "text-foreground [text-shadow:0_0_15px_rgba(255,126,179,0.4),0_0_30px_rgba(232,54,93,0.2)]",
              tier === "black" && "text-foreground [text-shadow:0_0_20px_rgba(255,255,255,0.4),0_0_40px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]",
              tier === "standard" && "text-foreground",
            )}
          >
            {tt.name}
          </span>
          <span
            className={cn(
              "font-[family-name:var(--font-mono)] text-[11px] max-[480px]:text-[10px] tracking-[0.5px] block",
              tier === "valentine" ? "text-[rgba(255,200,220,0.7)]" : "text-muted-foreground",
            )}
          >
            {tt.description || "Standard entry"}
          </span>
        </div>
        <span
          className={cn(
            "relative z-[2] font-[family-name:var(--font-mono)] text-[15px] max-[480px]:text-[13px] font-bold tracking-[1px] shrink-0",
            tier === "valentine" && "text-foreground [text-shadow:0_0_10px_rgba(255,126,179,0.3)]",
            tier === "black" && "text-foreground [text-shadow:0_0_10px_rgba(255,255,255,0.3)]",
            (tier === "standard" || tier === "platinum") && "text-foreground",
          )}
        >
          {currSymbol}{priceDisplay}
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
                tier === "platinum" && "text-platinum border-platinum/40 hover:bg-platinum/15 hover:border-platinum",
                tier === "valentine" && "text-valentine-pink border-valentine/40 hover:bg-valentine/15 hover:border-valentine-light",
                tier === "black" && "text-foreground border-foreground/30 hover:bg-foreground/10 hover:border-foreground/50",
                tier === "standard" && "text-platinum border-platinum/40 hover:bg-platinum/15 hover:border-platinum",
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
              tier === "platinum" && "bg-platinum/10 border-platinum/35 text-platinum hover:bg-platinum/20 hover:border-platinum",
              tier === "valentine" && "bg-valentine/10 border-valentine/40 text-foreground hover:bg-valentine/20 hover:border-valentine-light",
              tier === "black" && "bg-foreground/[0.08] border-foreground/25 text-foreground hover:bg-foreground/15 hover:border-foreground/45",
            )}
            onClick={() => onRemove(tt)}
            aria-label={`Remove ${tt.name}`}
          >
            &minus;
          </Button>
          <span
            className={cn(
              "font-[family-name:var(--font-mono)] text-lg max-[480px]:text-base font-bold min-w-7 max-[480px]:min-w-6 text-center",
              isActive && tier === "standard" && "text-primary",
              isActive && tier === "platinum" && "text-platinum",
              isActive && tier === "valentine" && "text-valentine-pink",
              isActive && tier === "black" && "text-primary",
              !isActive && "text-foreground",
            )}
          >
            {qty}
          </span>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "w-10 h-10 max-[480px]:w-9 max-[480px]:h-9 text-base max-[480px]:text-[15px] touch-manipulation",
              tier === "platinum" && "bg-platinum/10 border-platinum/35 text-platinum hover:bg-platinum/20 hover:border-platinum",
              tier === "valentine" && "bg-valentine/10 border-valentine/40 text-foreground hover:bg-valentine/20 hover:border-valentine-light",
              tier === "black" && "bg-foreground/[0.08] border-foreground/25 text-foreground hover:bg-foreground/15 hover:border-foreground/45",
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
