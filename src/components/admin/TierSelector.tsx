"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    id: "standard" as const,
    label: "Standard",
    desc: "Default clean style",
    classes: "bg-card border-primary/40 text-foreground",
    activeClasses: "ring-2 ring-primary border-primary",
  },
  {
    id: "platinum" as const,
    label: "Platinum",
    desc: "Silver/VIP shimmer",
    classes: "bg-gradient-to-br from-[#1e1e2a] to-card border-[#e5e4e2]/30 text-[#e5e4e2]",
    activeClasses: "ring-2 ring-[#e5e4e2] border-[#e5e4e2]",
  },
  {
    id: "black" as const,
    label: "Black",
    desc: "Dark obsidian premium",
    classes: "bg-gradient-to-br from-[#0a0a0a] to-card border-white/20 text-foreground",
    activeClasses: "ring-2 ring-white/50 border-white/50",
  },
  {
    id: "valentine" as const,
    label: "Valentine",
    desc: "Pink-red with hearts",
    classes: "bg-gradient-to-br from-[#2a0a14] to-[#1f0810] border-[#e8365d]/30 text-[#ff7eb3]",
    activeClasses: "ring-2 ring-[#e8365d] border-[#e8365d]",
    icon: true,
  },
];

export type TierValue = "standard" | "platinum" | "black" | "valentine";

interface TierSelectorProps {
  value: TierValue;
  onChange: (tier: TierValue) => void;
  className?: string;
}

export function TierSelector({ value, onChange, className }: TierSelectorProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {TIERS.map((tier) => {
        const isActive = value === tier.id;
        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => onChange(tier.id)}
            className={cn(
              "rounded-md border px-3 py-2.5 text-center transition-all duration-150 cursor-pointer",
              tier.classes,
              isActive && tier.activeClasses
            )}
          >
            <span className="flex items-center justify-center gap-1 font-mono text-xs uppercase tracking-wider">
              {tier.icon && <Heart size={10} />}
              {tier.label}
            </span>
            <span className="block text-[10px] opacity-60 mt-0.5">
              {tier.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
