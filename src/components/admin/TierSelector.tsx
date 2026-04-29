"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Replaces the previous 4-tile picker (Standard / Platinum / Black /
 * Valentine) with a single binary "VIP styling" toggle.
 *
 * Why: Black and Valentine had near-zero adoption (1 + 2 events
 * respectively as of 2026-04-29) and the 4-tile UI made tier feel like
 * a meaningful product decision. It isn't — it's a visual treatment.
 * One knob, one decision, faster to grok.
 *
 * Mapping:
 * - Toggle OFF → tier="standard"
 * - Toggle ON  → tier="platinum"
 *
 * Legacy values: events stored as "black" or "valentine" still load
 * correctly (TierValue type is unchanged); the toggle reads as ON for
 * any non-standard value. Switching the toggle off coerces back to
 * "standard". A host who wants to keep their legacy tier just doesn't
 * touch the toggle.
 */

const VIP_TIERS = new Set(["platinum", "black", "valentine"] as const);

export type TierValue = "standard" | "platinum" | "black" | "valentine";

interface TierSelectorProps {
  value: TierValue;
  onChange: (tier: TierValue) => void;
  className?: string;
}

export function TierSelector({ value, onChange, className }: TierSelectorProps) {
  const isVip = VIP_TIERS.has(value as "platinum" | "black" | "valentine");
  const isLegacyTier = value === "black" || value === "valentine";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-4 rounded-md border border-border/50 bg-card/40 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground">
            VIP styling
          </div>
          <div className="text-[10px] leading-tight text-muted-foreground/85 mt-0.5">
            Silver shimmer treatment on the buyer-side ticket card.
            {isLegacyTier && (
              <>
                {" "}
                <span className="text-warning/90">
                  This ticket uses a legacy &quot;{value}&quot; style — toggle off to revert.
                </span>
              </>
            )}
          </div>
        </div>
        <Switch
          checked={isVip}
          onCheckedChange={(checked) =>
            onChange(checked ? "platinum" : "standard")
          }
        />
      </div>
    </div>
  );
}
