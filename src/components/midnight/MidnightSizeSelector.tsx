"use client";

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
}: MidnightSizeSelectorProps) {
  return (
    <div className="flex justify-center gap-1.5 max-md:gap-1 flex-wrap">
      {sizes.map((size) => {
        const isSelected = selectedSize === size;

        return (
          <button
            key={size}
            type="button"
            className={`min-w-[44px] max-md:min-w-[40px] h-10 max-md:h-[38px] px-2.5 font-[family-name:var(--font-mono)] text-[11px] max-md:text-[10px] font-bold tracking-[1px] rounded-lg border transition-all duration-150 cursor-pointer ${
              isSelected
                ? "bg-white/15 border-white/50 text-white shadow-[0_0_10px_rgba(255,255,255,0.08)]"
                : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-white/50 hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] hover:text-white/70"
            }`}
            onClick={() => onSelect(size)}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
