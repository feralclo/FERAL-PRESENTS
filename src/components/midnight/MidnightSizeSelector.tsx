"use client";

import { Button } from "@/components/ui/button";

interface MidnightSizeSelectorProps {
  sizes: string[];
  selectedSize: string;
  onSelect: (size: string) => void;
  variant?: "default" | "platinum";
}

export function MidnightSizeSelector({
  sizes,
  selectedSize,
  onSelect,
  variant = "default",
}: MidnightSizeSelectorProps) {
  return (
    <div className="flex justify-center gap-1.5 max-md:gap-1 flex-wrap">
      {sizes.map((size) => {
        const isSelected = selectedSize === size;
        const platinumClasses = variant === "platinum"
          ? isSelected
            ? "bg-platinum/20 border-platinum text-platinum shadow-[0_0_15px_rgba(229,228,226,0.3)]"
            : "hover:bg-platinum/10 hover:border-platinum/40 hover:text-platinum"
          : "";

        return (
          <Button
            key={size}
            variant={isSelected ? "default" : "outline"}
            className={`min-w-[44px] max-md:min-w-[40px] h-10 max-md:h-[38px] px-2.5 font-[family-name:var(--font-mono)] text-[11px] max-md:text-[10px] font-bold tracking-[1px] ${platinumClasses}`}
            onClick={() => onSelect(size)}
          >
            {size}
          </Button>
        );
      })}
    </div>
  );
}
