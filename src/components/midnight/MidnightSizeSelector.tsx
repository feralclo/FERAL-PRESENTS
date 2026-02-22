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
            className={`min-w-[38px] max-md:min-w-[42px] h-9 max-md:min-h-[44px] px-2 font-[family-name:var(--font-mono)] text-[11px] max-md:text-[10px] font-bold tracking-[0.5px] rounded-lg border transition-all duration-150 cursor-pointer ${
              isSelected
                ? "bg-white/10 border-white/40 text-white shadow-[0_0_10px_rgba(255,255,255,0.06)]"
                : "bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.06)] text-white/50 hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.12)] hover:text-white/70"
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
